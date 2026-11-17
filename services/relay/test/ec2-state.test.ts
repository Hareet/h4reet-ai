// F7, part 1 (spec 001 bug-fixes, night 5; contracts/relay-http.md §6, amended): the status's `ec2` is the snapshot
// sink's last read of EC2, from the document its host write keeps on the tunnel end, /var/lib/h4reet/snapshot/
// latest.json, which compose binds read-only into the relay. Before this, nothing supplied it and the relay said
// `unknown` whatever EC2 did (app.ts's default). The document is read at most once in 5 s, as the status reads the
// store; it is `unknown` when missing, unreadable, off its schema, more than 150 s old (the write's 2 minutes and its
// run's 30 s), or more than a minute ahead.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { documentEc2State, EC2_DOCUMENT_MAX_AGE_MS, ec2StateOf, SNAPSHOT_DOCUMENT } from "../src/ec2state.js";
import { assemble, prepare } from "../src/start.js";
import { captureLog, Clock, relayEnv, StubStore, TEST_PUBLIC } from "./helpers.js";

const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** The sink's document as its write keeps it (data-model.md §5), with the parts this reader ignores left out. */
function doc(state: string, takenAt: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: 1,
    written_at: iso(takenAt),
    serving: { host: "ec2", since: iso(takenAt - 60_000), ec2_state: state, taken_at: iso(takenAt) },
    spend: null,
    server: null,
    handovers: null,
    host_panels: null,
    releases: { laptop: null, ec2: null },
    ec2_hours: null,
    ...extra,
  });
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function folder(): string {
  const d = mkdtempSync(join(tmpdir(), "relay-ec2-"));
  dirs.push(d);
  return d;
}

describe("the document's EC2 state", () => {
  const now = Date.UTC(2026, 10, 17, 2, 0, 0);

  it("is the path the tunnel end's write keeps, and a bound of 150 s", () => {
    expect(SNAPSHOT_DOCUMENT).toBe("/var/lib/h4reet/snapshot/latest.json");
    expect(EC2_DOCUMENT_MAX_AGE_MS).toBe(150_000);
  });

  it.each(["running", "pending", "stopping", "stopped", "interrupted", "unknown"])(
    "reads %s from a fresh document",
    (state) => {
      expect(ec2StateOf(doc(state, now - 30_000), now)).toBe(state);
    },
  );

  it("reads it up to 150 s after the write took it, and unknown after", () => {
    expect(ec2StateOf(doc("running", now - 150_000), now)).toBe("running");
    expect(ec2StateOf(doc("running", now - 151_000), now)).toBe("unknown");
  });

  it("reads unknown from a document more than a minute ahead of the relay's clock", () => {
    // The document's times are whole seconds, so the first time past the minute is 61 s ahead.
    expect(ec2StateOf(doc("running", now + 60_000), now)).toBe("running");
    expect(ec2StateOf(doc("running", now + 61_000), now)).toBe("unknown");
  });

  it.each([
    ["no document", undefined],
    ["an empty file", ""],
    ["not JSON", "{"],
    ["a list", "[]"],
    ["another schema", doc("running", now, { schema: 2 })],
    ["no serving part", JSON.stringify({ schema: 1 })],
    ["a state outside the contract's", doc("terminated", now)],
    ["a state of another type", doc("running", now).replace('"running"', "1")],
    ["no time", doc("running", now).replace(/"taken_at":"[^"]*"/, '"taken_at":null')],
    ["a time off its shape", doc("running", now).replace(/"taken_at":"[^"]*"/, '"taken_at":"yesterday"')],
  ])("reads unknown from %s", (_why, text) => {
    expect(ec2StateOf(text, now)).toBe("unknown");
  });
});

describe("the document, read from its file", () => {
  it("reads the file at most once in 5 s", () => {
    const clock = new Clock();
    const path = join(folder(), "latest.json");
    writeFileSync(path, doc("stopped", clock.now()));
    let reads = 0;
    const state = documentEc2State(path, clock.now, (p) => {
      reads += 1;
      return ec2File(p);
    });
    expect(state()).toBe("stopped");
    writeFileSync(path, doc("running", clock.now()));
    clock.advance(4_999);
    expect(state()).toBe("stopped");
    expect(reads).toBe(1);
    clock.advance(1);
    expect(state()).toBe("running");
    expect(reads).toBe(2);
  });

  it("reads unknown while the file is missing, and its state once the write keeps it", () => {
    const clock = new Clock();
    const path = join(folder(), "latest.json");
    const state = documentEc2State(path, clock.now);
    expect(state()).toBe("unknown");
    writeFileSync(path, doc("running", clock.now()));
    clock.advance(5_000);
    expect(state()).toBe("running");
  });

  it("ages a cached read: a write that stops shows unknown once its document is 150 s old", () => {
    const clock = new Clock();
    const path = join(folder(), "latest.json");
    writeFileSync(path, doc("running", clock.now()));
    const state = documentEc2State(path, clock.now);
    expect(state()).toBe("running");
    clock.advance(150_001);
    expect(state()).toBe("unknown");
  });
});

describe("the status's ec2, through assemble", () => {
  it("is the document's state, where it was always unknown", async () => {
    const clock = new Clock();
    const path = join(folder(), "latest.json");
    writeFileSync(path, doc("running", clock.now() - 20_000));
    const ready = prepare(relayEnv("http://127.0.0.1:9", "http://127.0.0.1:9"), TEST_PUBLIC, clock.now);
    if (ready.kind !== "ready") throw new Error(ready.lines.join("\n"));
    const running = assemble(
      ready,
      new StubStore(),
      undefined,
      captureLog().logger,
      clock.now,
      async () => true,
      documentEc2State(path, clock.now),
    );
    for (let i = 0; i < 3; i += 1) {
      await running.check();
      clock.advance(1_000);
    }
    const status = (await running.listeners.internal.inject({ method: "GET", url: "/api/status" })).json();
    expect(status).toMatchObject({ serving: "laptop", ec2: "running" });
    // Nothing of the document but its state reaches the status.
    expect(Object.keys(status)).not.toContain("ec2_state");
  });

  it("is unknown by default where the tunnel end's document doesn't exist, as in this suite", async () => {
    const clock = new Clock();
    const ready = prepare(relayEnv("http://127.0.0.1:9", "http://127.0.0.1:9"), TEST_PUBLIC, clock.now);
    if (ready.kind !== "ready") throw new Error(ready.lines.join("\n"));
    const running = assemble(ready, new StubStore(), undefined, captureLog().logger, clock.now, async () => false);
    const status = (await running.listeners.internal.inject({ method: "GET", url: "/api/status" })).json();
    expect(status.ec2).toBe("unknown");
  });
});

/** The file's text, or undefined when it can't be read: the reader the relay uses by default. */
function ec2File(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
