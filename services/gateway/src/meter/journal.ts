// The journal (data-model.md §3): the call records FR-031's initialization rebuilds from, on the per-stack host bind
// mount, where even `docker compose down -v` and the loss of the store's volume leave them.
//
// - One file per gateway-clock month, ${GATEWAY_STATE_DIR}/journal/YYYY-MM.jsonl, mode 0600, in a 0700 directory. A
//   record goes into the file of the month of its own `ts`.
// - One JSON object per line, under 4 KB. One writer: appends are queued in process.
// - Each append is one write() on a descriptor opened with O_APPEND, then fsync(). The first append to a new file also
//   fsyncs the directory. Only a record whose fsync returned has been written.
// - The record kinds are `reserve` and `commit` (the metered path, tasks.md T072), `operator` (init, reset, renew),
//   and `clock` (dev's test clock).
import { constants } from "node:fs";
import { mkdir, open, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { gatewayTime, monthKey, toRfc3339 } from "../core/clock.js";
import { errorClass } from "./store.js";

export type JournalStatus = "ok" | "unwritable" | "unknown";
export type Attribution = "fallback" | "metered" | "test";

interface Common {
  v: 1;
  ts: string; // the gateway clock, RFC 3339 with milliseconds
  stack: string;
}
export interface ReserveRecord extends Common {
  kind: "reserve";
  reservation_id: string;
  attribution: Attribution;
  adapter: string;
  provider: string;
  model: string;
  price_version: string;
  max_micro: number;
  period_day: string;
  period_month: string;
  expires_at: string;
}
export interface CommitRecord extends Common {
  kind: "commit";
  reservation_id: string;
  ledger_id: string;
  cost_micro: number;
  cost_basis: string;
  outcome: string;
  error_kind: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  attribution: Attribution;
  period_day: string;
  period_month: string;
  trace_id: string;
}
export interface OperatorRecord extends Common {
  kind: "operator";
  action: "init" | "reset" | "renew";
  audit_id: number;
  actor: string;
  period_day: string;
  period_month: string;
  // init: the chosen values
  day_micro?: number;
  month_micro?: number;
  fallback_day_micro?: number;
  confirm_zero?: boolean;
  renewed?: boolean;
  // renew, and init with renewed: true
  allowance_micro?: number;
  grant_no?: number;
}
export interface ClockRecord extends Common {
  kind: "clock";
  offset_ms: number;
  gateway_time: string;
  audit_id: number;
}
export type JournalRecord = ReserveRecord | CommitRecord | OperatorRecord | ClockRecord;

/** A record before the journal stamps it: v, ts, and stack are the journal's. */
export type NewRecord =
  | Omit<OperatorRecord, keyof Common>
  | Omit<ClockRecord, keyof Common>
  | Omit<ReserveRecord, keyof Common>
  | Omit<CommitRecord, keyof Common>;

/** The journal directory exists but can't be read: init answers 409 journal_unreadable (data-model.md §8 step 1). */
export class JournalUnreadableError extends Error {
  constructor(readonly code: string) {
    super("the journal can't be read");
    this.name = "JournalUnreadableError";
  }
}

export class JournalWriteError extends Error {
  constructor(readonly code: string) {
    super("the journal can't be written");
    this.name = "JournalWriteError";
  }
}

/** What a rebuild read (data-model.md §3, "What a rebuild reads"). */
export interface JournalScan {
  /** Relative to the state directory, the current month's first: "journal/2026-10.jsonl". */
  filesRead: string[];
  /** This stack's well-formed records in the files read. */
  records: JournalRecord[];
  /** Lines that don't parse (a crash tears only the last), and records of another stack, or of a kind out of place. */
  linesSkipped: number;
  /** dev: the newest clock record's offset; null without one, and always outside dev. */
  clockOffsetMs: number | null;
}

const MAX_LINE_BYTES = 4_096;
const MONTH_FILE = /^(\d{4}-\d{2})\.jsonl$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const ATTRIBUTIONS = new Set(["fallback", "metered", "test"]);

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === "string" && v !== "";

/** A line as a record of this journal's shapes, or undefined. */
function parseLine(line: string): JournalRecord | undefined {
  let r: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    r = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (r.v !== 1 || typeof r.ts !== "string" || !RFC3339.test(r.ts) || Number.isNaN(Date.parse(r.ts))) return undefined;
  if (!isText(r.stack)) return undefined;
  const periods = isText(r.period_day) && isText(r.period_month);
  switch (r.kind) {
    case "reserve":
      return isText(r.reservation_id) && ATTRIBUTIONS.has(String(r.attribution)) && isCount(r.max_micro) && periods
        ? (r as unknown as ReserveRecord)
        : undefined;
    case "commit":
      return isText(r.reservation_id) && ATTRIBUTIONS.has(String(r.attribution)) && isCount(r.cost_micro) && periods
        ? (r as unknown as CommitRecord)
        : undefined;
    case "operator": {
      if (!["init", "reset", "renew"].includes(String(r.action)) || !periods || !isCount(r.audit_id)) return undefined;
      if (r.action === "init" && !(isCount(r.day_micro) && isCount(r.month_micro) && isCount(r.fallback_day_micro))) {
        return undefined;
      }
      const grants = r.action === "renew" || r.renewed === true;
      if (grants && !(isCount(r.allowance_micro) && isCount(r.grant_no) && r.grant_no >= 1)) return undefined;
      return r as unknown as OperatorRecord;
    }
    case "clock":
      return isCount(r.offset_ms) && typeof r.gateway_time === "string" ? (r as unknown as ClockRecord) : undefined;
    default:
      return undefined;
  }
}

/** The month before YYYY-MM. */
function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return monthKey(Date.UTC(year, m - 2, 1));
}

export interface JournalOptions {
  /** GATEWAY_STATE_DIR: the journal lives in its journal/ directory. */
  stateDir: string;
  /** H4_STACK: every record carries it, and a rebuild skips another stack's. */
  stack: string;
}

export class Journal {
  private state: JournalStatus = "unknown";
  private queue: Promise<unknown> = Promise.resolve();
  readonly dir: string;

  constructor(private readonly opts: JournalOptions) {
    this.dir = join(opts.stateDir, "journal");
  }

  /** The result of the last append (GET /health's `journal`); unknown before the first. */
  status(): JournalStatus {
    return this.state;
  }

  /** The file a record at this gateway time goes into, relative to the state directory. */
  fileFor(gatewayMs: number): string {
    return `journal/${monthKey(gatewayMs)}.jsonl`;
  }

  /**
   * Appends one record at this gateway time, durably: it resolves once the record's fsync has returned, and rejects
   * with a JournalWriteError otherwise. Appends run one at a time, in order.
   */
  append(record: NewRecord, gatewayMs: number): Promise<void> {
    const { kind, ...fields } = record;
    const line = `${JSON.stringify({ v: 1, kind, ts: toRfc3339(gatewayMs), stack: this.opts.stack, ...fields })}\n`;
    const write = this.queue.then(() => this.write(line, monthKey(gatewayMs)));
    this.queue = write.catch(() => {});
    return write;
  }

  private async write(line: string, month: string): Promise<void> {
    try {
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw Object.assign(new Error("too long"), { code: "E2BIG" });
      const created = await mkdir(this.dir, { recursive: true, mode: 0o700 });
      if (created !== undefined) await fsyncDir(dirname(this.dir));
      const path = join(this.dir, `${month}.jsonl`);
      let fresh = true;
      let file;
      try {
        file = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL, 0o600);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        fresh = false;
        file = await open(path, constants.O_WRONLY | constants.O_APPEND);
      }
      try {
        await file.write(line);
        await file.sync();
      } finally {
        await file.close();
      }
      if (fresh) await fsyncDir(this.dir);
      this.state = "ok";
    } catch (err) {
      this.state = "unwritable";
      throw new JournalWriteError(errorClass(err));
    }
  }

  /**
   * What a rebuild reads (data-model.md §3): the file of the current gateway-clock month and the one before it. In
   * dev, the newest clock record decides which months are current, so every month's file is read for clock records
   * first; outside dev a clock record is skipped and counted. A missing directory is a new host: no records.
   */
  async scan(o: { envClass: "prod" | "dev"; realNow: number }): Promise<JournalScan> {
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => MONTH_FILE.test(n)).sort();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { filesRead: [], records: [], linesSkipped: 0, clockOffsetMs: null };
      }
      throw new JournalUnreadableError(errorClass(err));
    }
    const parsed = new Map<string, { records: JournalRecord[]; skipped: number }>();
    const parse = async (name: string) => {
      const known = parsed.get(name);
      if (known !== undefined) return known;
      let text: string;
      try {
        text = await readFile(join(this.dir, name), "utf8");
      } catch (err) {
        throw new JournalUnreadableError(errorClass(err));
      }
      const out = { records: [] as JournalRecord[], skipped: 0 };
      for (const line of text.split("\n")) {
        if (line === "") continue;
        const record = parseLine(line);
        if (record === undefined || record.stack !== this.opts.stack) out.skipped += 1;
        else out.records.push(record);
      }
      parsed.set(name, out);
      return out;
    };

    let offset: number | null = null;
    if (o.envClass === "dev") {
      let newest: ClockRecord | undefined;
      for (const name of names) {
        for (const r of (await parse(name)).records) {
          if (r.kind === "clock" && (newest === undefined || Date.parse(r.ts) >= Date.parse(newest.ts))) newest = r;
        }
      }
      offset = newest?.offset_ms ?? null;
    }
    const month = monthKey(gatewayTime(o.realNow, offset));
    const filesRead: string[] = [];
    const records: JournalRecord[] = [];
    let linesSkipped = 0;
    for (const m of [month, previousMonth(month)]) {
      const name = `${m}.jsonl`;
      if (!names.includes(name)) continue;
      const file = await parse(name);
      filesRead.push(`journal/${name}`);
      linesSkipped += file.skipped;
      for (const r of file.records) {
        if (r.kind === "clock" && o.envClass !== "dev") linesSkipped += 1;
        else records.push(r);
      }
    }
    return { filesRead, records, linesSkipped, clockOffsetMs: offset };
  }
}

async function fsyncDir(path: string): Promise<void> {
  const dir = await open(path, constants.O_RDONLY);
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
