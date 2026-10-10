// Host lookups through c-ares, not getaddrinfo (tasks.md T188).
//
// Node's default lookup, dns.lookup, runs getaddrinfo on libuv's threadpool, which treats it as slow I/O: at most
// half its threads run lookups, two of the default four. A lookup can't be cancelled, so one the resolver doesn't
// answer holds its slot until the resolver gives up, long after the request that asked was destroyed. On the agents'
// engine a stopped service's name took 8 s to fail with EAI_AGAIN, and the local adapter's health probe, once a
// second, kept the two lookup slots full and the queue behind them growing. T084's pre-run saw every other lookup in
// the process wait in that queue: every Telegram send timed out, and the store's connections failed, so the kill
// switch failed closed again and again while the model server was stopped.
//
// This lookup asks the resolvers in /etc/resolv.conf itself, through c-ares, which holds no thread and gives up after
// its own short timeout. It doesn't read /etc/hosts, so it answers localhost and IP literals itself; compose service
// names come from the engine's DNS. Like getaddrinfo, it honors ADDRCONFIG, which net passes for a connect that names
// no family: a family no non-loopback interface has an address in isn't asked for, or answered for localhost. Without
// that, a host with an AAAA record would hand a container without IPv6 an address it can't reach, and net's happy
// eyeballs would give up on the IPv4 connect after 250 ms to try it (the T188 review's S1). An explicit family is
// asked as given; net never sends one with the hint.
import { ADDRCONFIG, Resolver, type LookupAddress } from "node:dns";
import { isIP, Socket, type LookupFunction } from "node:net";
import os from "node:os";

type Family = 4 | 6;
type Answer = (err: NodeJS.ErrnoException | null, addresses: string[]) => void;

/** What this module asks of node:dns's Resolver: A and AAAA queries. */
export interface AddressResolver {
  resolve4(hostname: string, callback: Answer): void;
  resolve6(hostname: string, callback: Answer): void;
}

const LOCALHOST: Record<Family, string> = { 4: "127.0.0.1", 6: "::1" };

function familyOf(option: number | "IPv4" | "IPv6" | undefined): 0 | Family {
  if (option === 4 || option === "IPv4") return 4;
  if (option === 6 || option === "IPv6") return 6;
  return 0;
}

/** The families a non-loopback interface has an address in: what getaddrinfo's ADDRCONFIG keeps. */
export function configuredFamilies(): ReadonlySet<Family> {
  const found = new Set<Family>();
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal) found.add(address.family === "IPv6" ? 6 : 4);
    }
  }
  return found;
}

/** The error a name with no address gets: its code only, as dns.lookup's ENOTFOUND, and no hostname in its text. */
function notFound(): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error("no address");
  err.code = "ENOTFOUND";
  return err;
}

/**
 * A lookup with dns.lookup's contract over resolver: one address, or all of them when options.all is set; A records
 * before AAAA when either family will do, and, with ADDRCONFIG in options.hints, only the families `families` names
 * (both when it names neither, or can't be read). After an A query it asks for AAAA only when options.all wants every
 * address, or the name has no A record (ENODATA): a name that doesn't exist, or a resolver that doesn't answer, won't
 * do better for the other. An error that says more than ENODATA is the one reported. Its callback always runs on a
 * later tick, as dns.lookup's does.
 */
export function makeLookup(
  resolver: AddressResolver,
  families: () => ReadonlySet<Family> = configuredFamilies,
): LookupFunction {
  return (hostname, options, callback) => {
    const finish = (err: NodeJS.ErrnoException | null, found: LookupAddress[]): void => {
      process.nextTick(() => {
        const first = found[0];
        if (first === undefined) callback(err ?? notFound(), options.all ? [] : "");
        else if (options.all) callback(null, found);
        else callback(null, first.address, first.family);
      });
    };
    const literal = isIP(hostname);
    if (literal !== 0) {
      finish(null, [{ address: hostname, family: literal }]);
      return;
    }
    const wanted = familyOf(options.family);
    let order: Family[] = wanted === 0 ? [4, 6] : [wanted];
    if (wanted === 0 && ((options.hints ?? 0) & ADDRCONFIG) !== 0) {
      let have: ReadonlySet<Family> = new Set();
      try {
        have = families();
      } catch {
        // Interfaces that can't be read filter nothing, as interfaces in neither family don't.
      }
      const kept = order.filter((family) => have.has(family));
      if (kept.length > 0) order = kept;
    }
    if (hostname.toLowerCase() === "localhost") {
      finish(
        null,
        order.map((family) => ({ address: LOCALHOST[family], family })),
      );
      return;
    }
    const found: LookupAddress[] = [];
    let error: NodeJS.ErrnoException | null = null;
    const ask = (rest: Family[]): void => {
      const [family, ...later] = rest;
      if (family === undefined || (found.length > 0 && !options.all)) {
        finish(found.length > 0 ? null : error, found);
        return;
      }
      const query = family === 4 ? resolver.resolve4 : resolver.resolve6;
      query.call(resolver, hostname, (err, addresses) => {
        if (err === null) {
          found.push(...addresses.map((address) => ({ address, family })));
        } else {
          if (error === null || error.code === "ENODATA") error = err;
          if (err.code !== "ENODATA") {
            finish(found.length > 0 ? null : error, found);
            return;
          }
        }
        ask(later);
      });
    };
    ask(order);
  };
}

/** The lookup for a request to a named host: 1 s a try, two tries, and no thread held meanwhile. */
export const aresLookup: LookupFunction = makeLookup(new Resolver({ timeout: 1000, tries: 2 }));

/**
 * A socket that resolves its host through aresLookup when it connects, for a client that connects a socket it is
 * handed: pg's `stream` (meter/store.ts, tasks.md T189). pg calls connect(port, host), or connect(path) for a Unix
 * socket, and with no lookup given, net would ask getaddrinfo for the host.
 */
export function aresSocket(): Socket {
  const socket = new Socket();
  const connect = socket.connect.bind(socket);
  socket.connect = ((portOrPath: number | string, host?: string) =>
    typeof portOrPath === "string"
      ? connect(portOrPath)
      : connect({ port: portOrPath, host, lookup: aresLookup })) as Socket["connect"];
  return socket;
}
