// EC2's state for the status's `ec2` (contracts/relay-http.md §6, amended by F7, night 5): the snapshot sink's last
// read of EC2, `ec2:DescribeInstances` every 2 minutes with the tunnel end's role, which no container holds. The sink's
// host write keeps its merged document in /var/lib/h4reet/snapshot/latest.json (contracts/public-view.md §2), and
// compose binds that folder read-only into the relay. The relay reads the document at most once in 5 s, as its status
// reads the store, and takes `serving.ec2_state` alone, while `serving.taken_at` is at most 150 s old: the write's
// 2 minutes and its run's stated 30 s, so a healthy write never flaps to `unknown`, and one that stops shows `unknown`
// within 2.5 minutes. Missing, unreadable, off its schema, too old, or more than a minute ahead: `unknown`.
import { readFileSync } from "node:fs";

import type { Ec2State } from "./app.js";

/** Where the tunnel end's write keeps the document (deploy/scripts/snapshot_sink.py's STATE_DIR). */
export const SNAPSHOT_DOCUMENT = "/var/lib/h4reet/snapshot/latest.json";
/** The write's 2 minutes, and its run's 30 s (contracts/public-view.md §1). */
export const EC2_DOCUMENT_MAX_AGE_MS = 150_000;
/** A document stamped further ahead of the relay's clock than this is not believed. */
const AHEAD_MS = 60_000;
/** At most one read of the file in this long, as the status's read of the store (spec 004's Amendment A1). */
export const EC2_READ_MS = 5_000;

const STATES: readonly Ec2State[] = ["running", "pending", "stopping", "stopped", "interrupted", "unknown"];
const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The document's state and the time it was taken, or null when it doesn't read as the sink's document. */
function parse(text: string | undefined): { state: Ec2State; takenAt: number } | null {
  if (text === undefined) return null;
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(doc) || doc.schema !== 1 || !isRecord(doc.serving)) return null;
  const { ec2_state: state, taken_at: takenAt } = doc.serving;
  if (typeof state !== "string" || !(STATES as readonly string[]).includes(state)) return null;
  if (typeof takenAt !== "string" || !TIME.test(takenAt)) return null;
  const at = Date.parse(takenAt);
  return Number.isNaN(at) ? null : { state: state as Ec2State, takenAt: at };
}

function fresh(read: { state: Ec2State; takenAt: number } | null, nowMs: number): Ec2State {
  if (read === null) return "unknown";
  const age = nowMs - read.takenAt;
  return age > EC2_DOCUMENT_MAX_AGE_MS || age < -AHEAD_MS ? "unknown" : read.state;
}

/** EC2's state from the document's text at `nowMs`. */
export function ec2StateOf(text: string | undefined, nowMs: number): Ec2State {
  return fresh(parse(text), nowMs);
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** The status's `ec2`: the file read at most once in 5 s, its age judged at every call. */
export function documentEc2State(
  path: string = SNAPSHOT_DOCUMENT,
  now: () => number = Date.now,
  read: (path: string) => string | undefined = readText,
): () => Ec2State {
  let last: { read: ReturnType<typeof parse>; at: number } | null = null;
  return () => {
    const t = now();
    if (last === null || t - last.at >= EC2_READ_MS) last = { read: parse(read(path)), at: t };
    return fresh(last.read, t);
  };
}
