// The peer rule and the viewer's address (contracts/relay-http.md §1 and §3, step 2).
//
// On the edge listener a request whose TCP peer is loopback, in the Docker address pool the tunnel end's daemon fixes,
// or one of the tunnel end's own addresses is refused with 403 edge_required: a container or a host process could
// otherwise set CloudFront-Viewer-Address. The ranges come from the compose file as a literal (RELAY_REFUSED_PEERS),
// so no env file can widen what the relay believes.
import { BlockList, isIP } from "node:net";

/** An IPv4 address mapped into IPv6 (::ffff:a.b.c.d), as Node reports an IPv4 peer on a dual-stack socket, as IPv4. */
export function plainAddress(address: string): string {
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  return m?.[1] ?? address;
}

/** A comma-separated list of CIDR ranges or bare addresses, each checked; a range that doesn't parse is a problem,
 *  never skipped, so a typo can't open the listener. */
export function parseRanges(text: string): { list: BlockList; problems: string[] } {
  const list = new BlockList();
  const problems: string[] = [];
  for (const raw of text.split(",")) {
    const item = raw.trim();
    if (item === "") continue;
    const [address = "", prefixText] = item.split("/");
    const family = isIP(address);
    const max = family === 4 ? 32 : 128;
    const prefix = prefixText === undefined ? max : Number(prefixText);
    if (family === 0 || !Number.isInteger(prefix) || prefix < 0 || prefix > max || prefixText === "") {
      problems.push(`RELAY_REFUSED_PEERS: "${item}" isn't an address or a CIDR range`);
      continue;
    }
    list.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
  }
  return { list, problems };
}

/** True when the peer is one the edge listener refuses. A peer that isn't an address at all is refused too. */
export function refusedPeer(list: BlockList, peer: string | undefined): boolean {
  if (peer === undefined) return true;
  const address = plainAddress(peer);
  const family = isIP(address);
  if (family === 0) return true;
  return list.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** CloudFront-Viewer-Address, "<address>:<port>", as the address alone, or undefined when it is missing or isn't one
 *  address and a port. IPv6 comes unbracketed, so the port is after the last colon. */
export function viewerAddress(header: string | string[] | undefined): string | undefined {
  if (typeof header !== "string") return undefined;
  const value = header.trim();
  const colon = value.lastIndexOf(":");
  if (colon <= 0) return undefined;
  const address = value.slice(0, colon);
  const port = value.slice(colon + 1);
  if (!/^\d{1,5}$/.test(port) || Number(port) > 65_535) return undefined;
  return isIP(address) === 0 ? undefined : address;
}

/** The eight 16-bit groups of an IPv6 address, or undefined when it isn't one. A dotted IPv4 tail is two groups. */
function ipv6Groups(text: string): number[] | undefined {
  let rest = text.split("%")[0] ?? "";
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(rest);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    rest = `${rest.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = rest.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] === "" ? [] : (halves[0] ?? "").split(":");
  const tail = halves.length === 2 ? (halves[1] === "" ? [] : (halves[1] ?? "").split(":")) : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return undefined;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return undefined;
  return groups.map((g) => parseInt(g, 16));
}

/** The client's key, as the public cap counts it and X-H4-Viewer carries it to the host's own per-client cap: an IPv4
 *  address as it is, and an IPv6 address by its /64, the network one subscriber holds, written as that network's first
 *  address (`2001:db8:1:2::`), so rotating the lower 64 bits rotates nothing past either cap (group 8's review A,
 *  I1). An address that doesn't parse is returned unchanged. */
export function clientKey(address: string): string {
  const plain = plainAddress(address);
  if (isIP(plain.split("%")[0] ?? "") !== 6) return plain;
  const groups = ipv6Groups(plain);
  if (groups === undefined) return plain;
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::`;
}
