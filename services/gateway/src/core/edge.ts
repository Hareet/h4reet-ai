// Which peer may name the client (contracts/gateway-http.md §2.3). Edge replaces any X-Forwarded-For a client sent
// with its own view of the client, so the header is believed only when edge is the TCP peer. Any other container on
// `internal` is itself the client: a header it sends is ignored, so it can't pick its own identity to slip the
// per-client cap.
import { lookup } from "node:dns/promises";

/** Whether this TCP peer is edge, whose X-Forwarded-For names the client. */
export type ForwardedBy = (peer: string) => Promise<boolean>;

export interface EdgePeerOptions {
  /** The edge service's name on the stack's network. */
  host?: string;
  /** How long a lookup's answer is used: edge's address changes only when its container is recreated. */
  ttlMs?: number;
  now?: () => number;
  resolve?: (host: string) => Promise<string[]>;
}

const bare = (address: string): string => (address.startsWith("::ffff:") ? address.slice(7) : address);

const systemResolve = async (host: string): Promise<string[]> =>
  (await lookup(host, { all: true })).map((found) => found.address);

/** True when the peer is one of the edge service's addresses. A lookup that fails believes no one, for one TTL. */
export function edgePeer(o: EdgePeerOptions = {}): ForwardedBy {
  const host = o.host ?? "edge";
  const ttlMs = o.ttlMs ?? 30_000;
  const now = o.now ?? Date.now;
  const resolve = o.resolve ?? systemResolve;
  let cached: { at: number; addresses: Promise<Set<string>> } | undefined;
  return async (peer) => {
    if (cached === undefined || now() - cached.at > ttlMs) {
      const addresses = resolve(host)
        .then((found) => new Set(found.map(bare)))
        .catch(() => new Set<string>());
      cached = { at: now(), addresses };
    }
    return (await cached.addresses).has(bare(peer));
  };
}
