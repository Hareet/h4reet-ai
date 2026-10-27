// T031 (spec 002; FR-014, FR-016; contracts/resume-source.md §2 and §3): make test runs the resume's own checks. The
// committed source, apps/web/content/resume.yaml, passes C1–C9 against the repository's corpus, and its lock is
// current: when a corpus or facts file it cites changes, this fails with the file's path, until
// `npm run content:lock -w apps/web` rewrites the lock and the Author approves what changed. The private denylist is
// applied when this checkout can read it (the Author's); agent sessions can't, and the gate's corpus step covers the
// proposal that carries the draft's words.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkLock, checkSource, parseResume, readLock, RESUME_PATH } from "../../build/content";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const source = parseResume(readFileSync(join(REPO, RESUME_PATH), "utf8"));

describe("the committed resume source", () => {
  it("passes the citation check, C1–C9, against the repository's corpus", () => {
    expect(checkSource(source, { root: REPO }).problems).toEqual([]);
  });

  it("is locked to the corpus it was checked against", () => {
    const lock = readLock(REPO);
    expect(lock, "no lock: run npm run content:lock -w apps/web").not.toBeNull();
    expect(checkLock(REPO, source, lock ?? { files: {} })).toEqual([]);
  });

  it("has at least one section, and every item at least one citation", () => {
    expect(source.sections.length).toBeGreaterThan(0);
    for (const section of source.sections) {
      expect(section.items.length, section.id).toBeGreaterThan(0);
      for (const item of section.items) expect(item.claims.length, item.id).toBeGreaterThan(0);
    }
  });
});
