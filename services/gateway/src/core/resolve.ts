// Host lookups through c-ares, not getaddrinfo (tasks.md T188).
//
// Node's default lookup, dns.lookup, runs getaddrinfo on libuv's threadpool: four threads unless UV_THREADPOOL_SIZE
// says otherwise. A lookup can't be cancelled, so one the resolver doesn't answer holds its thread until the resolver
// gives up, long after the request that asked was destroyed. On the agents' engine a stopped service's name took 8 s
// to fail with EAI_AGAIN. The local adapter's health probe, once a second, then kept about eight such lookups queued
// for four threads. T084's pre-run saw every other lookup in the process wait behind them: every Telegram send timed
// out, and the store's connections failed, so the kill switch failed closed again and again while the model server
// was stopped.
//
// This lookup asks the resolvers in /etc/resolv.conf itself, through c-ares, which holds no thread and gives up after
// its own short timeout. It doesn't read /etc/hosts, so it answers localhost and IP literals itself; compose service
// names come from the engine's DNS.
import { Resolver, type LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";

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

/** The error a name with no address gets: its code only, as dns.lookup's ENOTFOUND, and no hostname in its text. */
function notFound(): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error("no address");
  err.code = "ENOTFOUND";
  return err;
}

/**
 * A lookup with dns.lookup's contract over resolver: one address, or all of them when options.all is set; A records
 * before AAAA when either family will do. It asks for the next family only when the name has no record of this one
 * (ENODATA): a name that doesn't exist, or a resolver that doesn't answer, won't do better for the other. Its callback
 * always runs on a later tick, as dns.lookup's does.
 */
export function makeLookup(resolver: AddressResolver): LookupFunction {
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
    const order: Family[] = wanted === 0 ? [4, 6] : [wanted];
    if (hostname.toLowerCase() === "localhost") {
      finish(
        null,
        order.map((family) => ({ address: LOCALHOST[family], family })),
      );
      return;
    }
    const found: LookupAddress[] = [];
    let firstError: NodeJS.ErrnoException | null = null;
    const ask = (rest: Family[]): void => {
      const [family, ...later] = rest;
      if (family === undefined || (found.length > 0 && !options.all)) {
        finish(found.length > 0 ? null : firstError, found);
        return;
      }
      const query = family === 4 ? resolver.resolve4 : resolver.resolve6;
      query.call(resolver, hostname, (err, addresses) => {
        if (err === null) {
          found.push(...addresses.map((address) => ({ address, family })));
        } else {
          firstError ??= err;
          if (err.code !== "ENODATA") {
            finish(found.length > 0 ? null : firstError, found);
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
