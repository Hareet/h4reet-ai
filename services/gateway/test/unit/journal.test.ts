import { constants } from "node:fs";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { journalCandidates } from "../../src/meter/init.js";
import { Journal, JournalWriteError } from "../../src/meter/journal.js";

const STACK = "dev";
const OCT_9 = Date.UTC(2026, 9, 9, 12, 0, 0);
const dirs: string[] = [];

async function stateDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "h4-journal-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

/** A well-formed init record (data-model.md §3), told apart by its audit row's ID. */
function operator(auditId: number) {
  return {
    kind: "operator" as const,
    action: "init" as const,
    audit_id: auditId,
    actor: "operator:dev#00000000",
    period_day: "2026-10-09",
    period_month: "2026-10",
    day_micro: 0,
    month_micro: 0,
    fallback_day_micro: 0,
  };
}

const ids = (records: unknown[]) => records.map((r) => (r as { audit_id: number }).audit_id);

/** An open() whose appending handles write only half of what they're given, as a filling disk does. */
const halfWrites: typeof open = (async (...args: Parameters<typeof open>) => {
  const handle = await open(...args);
  const flags = args[1];
  if (typeof flags !== "number" || (flags & constants.O_APPEND) === 0) return handle;
  return new Proxy(handle, {
    get(target, prop) {
      if (prop === "write") {
        return (buffer: Buffer, offset = 0, length = buffer.length) =>
          target.write(buffer, offset, Math.max(1, Math.floor(length / 2)));
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}) as typeof open;

describe("the journal's durability (data-model.md §3)", () => {
  it("reports a write cut short as not written, undoes it, and loses no later record", async () => {
    const dir = await stateDir();
    const good = new Journal({ stateDir: dir, stack: STACK });
    await good.append(operator(1), OCT_9);
    const path = join(dir, good.fileFor(OCT_9));
    const afterFirst = await readFile(path, "utf8");

    const short = new Journal({ stateDir: dir, stack: STACK, openFile: halfWrites });
    await expect(short.append(operator(2), OCT_9)).rejects.toBeInstanceOf(JournalWriteError); // a full disk
    expect(short.status()).toBe("unwritable");
    expect(await readFile(path, "utf8")).toBe(afterFirst); // the torn half was undone

    await good.append(operator(3), OCT_9); // space came back
    const scan = await good.scan({ envClass: "dev", realNow: OCT_9 });
    expect(ids(scan.records)).toEqual([1, 3]);
    expect(scan.linesSkipped).toBe(0);
  });

  it("starts a new line after a tail a crash tore, so the torn line never swallows the next record", async () => {
    const dir = await stateDir();
    const journal = new Journal({ stateDir: dir, stack: STACK });
    await journal.append(operator(1), OCT_9);
    const path = join(dir, journal.fileFor(OCT_9));
    await writeFile(path, (await readFile(path, "utf8")) + '{"v":1,"kind":"operator","ts":"2026-10-09T12:', "utf8");
    await journal.append(operator(2), OCT_9);
    const scan = await journal.scan({ envClass: "dev", realNow: OCT_9 });
    expect(ids(scan.records)).toEqual([1, 2]);
    expect(scan.linesSkipped).toBe(1);
  });
});

describe("the studio window's operator record (spec 003's contracts/gpu-window.md §1, §5)", () => {
  const studio = (auditId: number, state: "start" | "end") => ({
    kind: "operator" as const,
    action: "studio_window" as const,
    state,
    audit_id: auditId,
    actor: "operator:dev#00000000",
    period_day: "2026-10-09",
    period_month: "2026-10",
  });

  it("is a record a rebuild reads, not a line it skips, and it counts nothing", async () => {
    const dir = await stateDir();
    const journal = new Journal({ stateDir: dir, stack: STACK });
    await journal.append(studio(7, "start"), OCT_9);
    await journal.append(studio(8, "end"), OCT_9);
    const scan = await journal.scan({ envClass: "dev", realNow: OCT_9 });
    expect(ids(scan.records)).toEqual([7, 8]);
    expect(scan.linesSkipped).toBe(0);
    const candidates = journalCandidates(scan.records, { day: "2026-10-09", month: "2026-10" });
    expect(candidates).toEqual({
      calls: { day: 0n, month: 0n, fallback_day: 0n },
      floor: { day: null, month: null, fallback_day: null },
      callRecords: 0,
      renewal: undefined,
    });
  });

  it("is skipped without its state, as a record out of shape is", async () => {
    const dir = await stateDir();
    const journal = new Journal({ stateDir: dir, stack: STACK });
    const { state: _state, ...stateless } = studio(9, "start");
    void _state;
    await journal.append(stateless as unknown as ReturnType<typeof studio>, OCT_9);
    await journal.append({ ...studio(10, "start"), state: "paused" } as unknown as ReturnType<typeof studio>, OCT_9);
    const scan = await journal.scan({ envClass: "dev", realNow: OCT_9 });
    expect(ids(scan.records)).toEqual([]);
    expect(scan.linesSkipped).toBe(2);
  });
});
