// Spec 001's hosts (its contracts/env-cloud.md §2; research.md R-28): the two a gateway runs on, by H4_HOST. Their
// names are data, in hosts.json, which the room's source scan doesn't read (spec 004 FR-007; apps/web/build/room/
// scan.ts): the laptop's host name is also one of the room's piece IDs, and the scan holds every string literal of the
// gateway's code to the rule that no room ID stands in code. So the code takes the names from here.
import data from "./hosts.json" with { type: "json" };

/** A host's name: the laptop's or EC2's, as hosts.json names them. */
export type HostName = string;
/** The laptop's name: every laptop stack's host, dev's and dev-cpu's among them, and the host when H4_HOST is unset. */
export const LAPTOP: HostName = data.laptop;
/** EC2's name. */
export const EC2: HostName = data.ec2;
/** Every host a gateway runs on, the laptop first. */
export const HOST_NAMES: readonly HostName[] = [LAPTOP, EC2];
/** The names as a refusal's message gives them: "<laptop> or <ec2>". */
export const HOSTS_TEXT = HOST_NAMES.join(" or ");
/** H4_HOST as the gateway reads it: unset or empty is the laptop. */
export const hostOf = (value: string | undefined): string => (value === undefined || value === "" ? LAPTOP : value);
