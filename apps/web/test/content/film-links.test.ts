// Spec 023: the resume PDF, redone with links from the films (plan §3). The claim-to-film table is one file,
// films/resume-links.json (FR-003); each case reads it, never a copy. Cases are numbered as plan §3 numbers them.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const TABLE_PATH = "films/resume-links.json";

interface FilmLink {
  claim: string;
  film: string;
  media: string;
}
interface Table {
  schema: number;
  repo: string;
  pdf_sha256: string;
  links: FilmLink[];
}

/** The table as the tree holds it, or null when it isn't there yet (T001's RED). */
function table(): Table | null {
  const path = join(REPO, TABLE_PATH);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Table) : null;
}

const filmUrl = (t: Table, film: string): string => `${t.repo}/tree/main/films/${film}`;

/** Whether git tracks a path on this tree. */
const tracked = (path: string): boolean =>
  execFileSync("git", ["-C", REPO, "ls-files", "--error-unmatch", "--", path], { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim() !== "";
const isTracked = (path: string): boolean => {
  try {
    return tracked(path);
  } catch {
    return false;
  }
};

describe("spec 023: the film link table", () => {
  it("1. the table's four entries are well-formed, and each URL is repo/tree/main/films/<film>", () => {
    const t = table();
    expect(t, `${TABLE_PATH} is missing`).not.toBeNull();
    if (!t) return;
    expect(t.schema).toBe(1);
    expect(t.repo).toBe("https://github.com/hareet/h4reet-ai");
    expect(typeof t.pdf_sha256).toBe("string");
    expect(t.pdf_sha256).toMatch(/^(?:[0-9a-f]{64})?$/);
    expect(t.links.map((l) => l.film)).toEqual(["local-first", "cost-meter", "kill-switch-b2", "data-flows"]);
    for (const l of t.links) {
      expect(Object.keys(l).sort(), l.film).toEqual(["claim", "film", "media"]);
      expect(l.claim.trim(), l.film).not.toBe("");
      expect(l.film, l.film).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(l.media, l.film).toMatch(/^media\/[A-Za-z0-9._-]+\.mp4$/);
      expect(filmUrl(t, l.film)).toBe(`https://github.com/hareet/h4reet-ai/tree/main/films/${l.film}`);
    }
    expect(new Set(t.links.map((l) => l.claim.toLowerCase())).size).toBe(t.links.length);
  });

  it("2. each film's README.md and media are tracked, and the README's \"Watch the film\" link is the media (FR-012)", () => {
    const t = table();
    expect(t, `${TABLE_PATH} is missing`).not.toBeNull();
    if (!t) return;
    for (const l of t.links) {
      const readme = `films/${l.film}/README.md`;
      expect(isTracked(readme), `${readme} tracked`).toBe(true);
      expect(isTracked(`films/${l.film}/${l.media}`), `films/${l.film}/${l.media} tracked`).toBe(true);
      const watch = /\[Watch the film\]\(([^)\s]+)\)/.exec(readFileSync(join(REPO, readme), "utf8"))?.[1];
      expect(watch, readme).toBe(l.media);
    }
    expect(t.links.find((l) => l.film === "kill-switch-b2")?.media).toBe("media/kill-switch.mp4");
  });
});
