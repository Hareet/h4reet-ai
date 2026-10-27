// T023 (spec 002; FR-016; contracts/resume-source.md §3): the lock, apps/web/content/resume.lock.json, holds the
// SHA-256 of every corpus file a citation names and every facts file a slot reads. A change to one of them fails
// the check with its path; a change to a file nothing cites doesn't. `npm run content:lock -w apps/web` rewrites it.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { checkLock, computeLock, LOCK_PATH, parseResume, readLock, writeLock } from "../build/content";

const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));
const WEB = fileURLToPath(new URL("..", import.meta.url));

const made: string[] = [];
afterEach(() => {
  while (made.length) rmSync(made.pop() as string, { recursive: true, force: true });
});

/** A repository root holding a copy of the fixture corpus, which the test may change. */
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "h4-lock-"));
  made.push(dir);
  cpSync(join(FIXTURES, "corpus"), join(dir, "corpus"), { recursive: true });
  return dir;
}

const SOURCE = parseResume(
  stringify({
    version: 1,
    header: {
      room: {
        name: "Robin",
        lines: [
          {
            text: "Lighthouse keeping by background",
            claims: [{ file: "corpus/01-fixture.md", quote: "Robin's background is lighthouse keeping" }],
          },
        ],
      },
    },
    sections: [
      {
        id: "work",
        title: "Work",
        items: [
          {
            id: "lantern",
            text: "Designed the lantern service.{{slot:fixture.lanterns}}",
            verb: "designed",
            claims: [{ file: "corpus/01-fixture.md", quote: "Robin designed the lantern service" }],
            slots: ["fixture.lanterns"],
          },
        ],
      },
    ],
  }),
);

function append(dir: string, rel: string, text: string): void {
  writeFileSync(join(dir, rel), readFileSync(join(dir, rel), "utf8") + text);
}

describe("the lock", () => {
  it("names every cited corpus file and every facts file a slot reads, and nothing else", () => {
    const dir = root();
    expect(Object.keys(computeLock(dir, SOURCE).files)).toEqual(["corpus/01-fixture.md", "corpus/facts/fixture.yaml"]);
    expect(checkLock(dir, SOURCE, computeLock(dir, SOURCE))).toEqual([]);
  });

  it("fails with the path of a cited file that changed", () => {
    const dir = root();
    const lock = computeLock(dir, SOURCE);
    append(dir, "corpus/01-fixture.md", "\n- `[A 2026-01-02]` One more line.\n");
    expect(checkLock(dir, SOURCE, lock)).toEqual(["corpus changed since the lock: corpus/01-fixture.md"]);
  });

  it("fails with the path of a facts file a slot reads that changed", () => {
    const dir = root();
    const lock = computeLock(dir, SOURCE);
    append(dir, "corpus/facts/fixture.yaml", "# a note\n");
    expect(checkLock(dir, SOURCE, lock)).toEqual(["corpus changed since the lock: corpus/facts/fixture.yaml"]);
  });

  it("passes when only a file nothing cites changed", () => {
    const dir = root();
    const lock = computeLock(dir, SOURCE);
    append(dir, "corpus/02-other.md", "\n- `[A 2026-01-02]` Robin also keeps a garden.\n");
    expect(checkLock(dir, SOURCE, lock)).toEqual([]);
  });

  it("fails when a newly cited file isn't in it, or it names a file nothing cites any more", () => {
    const dir = root();
    const lock = computeLock(dir, SOURCE);
    const fewer = { files: { "corpus/01-fixture.md": lock.files["corpus/01-fixture.md"] as string } };
    expect(checkLock(dir, SOURCE, fewer)).toEqual(["corpus changed since the lock: corpus/facts/fixture.yaml"]);
    const more = { files: { ...lock.files, "corpus/02-other.md": lock.files["corpus/01-fixture.md"] as string } };
    expect(checkLock(dir, SOURCE, more)).toEqual([
      "the lock names a file the source no longer cites: corpus/02-other.md",
    ]);
  });

  it("is written as sorted JSON at its path, and read back the same", () => {
    const dir = root();
    mkdirSync(join(dir, "apps/web/content"), { recursive: true });
    const lock = computeLock(dir, SOURCE);
    writeLock(dir, lock);
    const text = readFileSync(join(dir, LOCK_PATH), "utf8");
    expect(text).toBe(`${JSON.stringify(lock, null, 2)}\n`);
    expect(readLock(dir)).toEqual(lock);
  });

  it("is missing, which the check reports with the command that writes it", () => {
    expect(readLock(root())).toBeNull();
  });

  it("is rewritten by npm run content:lock -w apps/web", () => {
    const pkg = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["content:lock"]).toBe("node --import tsx build/content.ts --lock");
  });
});
