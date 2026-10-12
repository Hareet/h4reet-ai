// Which peer may name the client (contracts/gateway-http.md §2.3). Edge replaces any X-Forwarded-For a client sent
// with its own view of the client, so the header is believed only when edge is the TCP peer. Any other container on
// `internal` is itself the client: a header it sends is ignored, so it can't pick its own identity to slip the
// per-client cap.
import type { LookupAddress } from "node:dns";

import { aresLookup } from "./resolve.js";

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

/**
 * Edge's addresses, through c-ares (core/resolve.ts): hello awaits this before the kill-switch read whenever the TTL
 * is due, so a lookup that doesn't answer gives up after c-ares's own tries, and holds neither of the two threads
 * libuv gives lookups meanwhile (tasks.md T189).
 */
const aresResolve = (host: string): Promise<string[]> =>
  new Promise((resolve, reject) => {
    aresLookup(host, { all: true }, (err, addresses) => {
      if (err !== null) reject(err);
      else resolve((addresses as LookupAddress[]).map((found) => found.address));
    });
  });

/** True when the peer is one of the edge service's addresses. A lookup that fails believes no one, for one TTL. */
export function edgePeer(o: EdgePeerOptions = {}): ForwardedBy {
  const host = o.host ?? "edge";
  const ttlMs = o.ttlMs ?? 30_000;
  const now = o.now ?? Date.now;
  const resolve = o.resolve ?? aresResolve;
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
