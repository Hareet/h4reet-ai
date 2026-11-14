// Spec 023: the resume PDF, redone with links from the films (plan §3). The claim-to-film table is one file,
// films/resume-links.json (FR-003); each case reads it, never a copy. Cases are numbered as plan §3 numbers them.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";

import { readPolicy } from "../../build/approvals";
import { checkAuthorPdf, parseResume, RESUME_PATH } from "../../build/content";
import {
  addLinks,
  c0002Sha,
  CANDIDATE_PATH,
  filmUrl as urlOf,
  locateClaims,
  readTable,
  type FilmLinkTable,
} from "../../build/film-links";
import { loadFonts, openPdf } from "../../build/pdf";
import { allowedUrl, AUTHOR_PDF_PATH, pdfProblems, readPdf, type PdfRules } from "../../build/resume-pdf";

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

// ---- The locator and the writer, over PDFKit fixtures (never the Author's file) ----

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const FIXTURE_TABLE: FilmLinkTable = {
  schema: 1,
  repo: "https://github.com/hareet/h4reet-ai",
  pdf_sha256: "",
  links: [
    { claim: "LOCAL MODELS FIRST", film: "local-first", media: "media/local-first.mp4" },
    { claim: "A REAL-TIME COST METER", film: "cost-meter", media: "media/cost-meter.mp4" },
    { claim: "A $5-A-DAY KILL SWITCH", film: "kill-switch-b2", media: "media/kill-switch.mp4" },
    { claim: "EVERY DATA FLOW DISCLOSED", film: "data-flows", media: "media/data-flows.mp4" },
  ],
};
const EXISTING_LINK = "https://hareet.ai/";
/** Rules that only PDF5's allowlist and PDF9 decide: no header, no forbidden phrase. */
const LINK_RULES: PdfRules = { header: null, normalize: (s) => s.toLowerCase(), forbidden: () => [] };

/** A one-page PDF with the four claims, the second wrapping onto two lines, one existing link, and other words. */
async function claimsPdf(options: { twice?: boolean } = {}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "LETTER",
    font: loadFonts().regular as unknown as string,
    info: { Title: "Resume" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  doc.fontSize(11).text("Robin, a fixture resume.", 54, 60);
  doc.fontSize(8).text("LOCAL MODELS FIRST", 54, 120, { lineBreak: false });
  doc.text("A REAL-TIME COST METER", 200, 120, { width: 60 });
  doc.text("A $5-A-DAY KILL SWITCH", 300, 120, { lineBreak: false });
  doc.text("EVERY DATA FLOW DISCLOSED", 420, 120, { lineBreak: false });
  if (options.twice) doc.text("LOCAL MODELS FIRST", 54, 300, { lineBreak: false });
  doc.link(54, 40, 120, 14, EXISTING_LINK);
  doc.end();
  return done;
}

/** Each link annotation's URL and quad points, as pdf.js reads them. */
async function linkAnnotations(bytes: Uint8Array): Promise<{ url: string; quads: number }[]> {
  const task = await openPdf(bytes);
  try {
    const page = await (await task.promise).getPage(1);
    return ((await page.getAnnotations()) as Record<string, unknown>[])
      .filter((a) => a.subtype === "Link")
      .map((a) => ({
        url: String(a.unsafeUrl ?? a.url),
        quads: a.quadPoints ? (a.quadPoints as ArrayLike<number>).length / 8 : 0,
      }));
  } finally {
    await task.destroy();
  }
}

describe("spec 023: the locator and the writer", () => {
  it("3. locateClaims finds each claim, one rectangle a line, and fails naming a claim it can't find", async () => {
    const pdf = await claimsPdf();
    const located = await locateClaims(pdf, FIXTURE_TABLE);
    expect(located.map((c) => c.claim)).toEqual(FIXTURE_TABLE.links.map((l) => l.claim));
    expect(located.map((c) => c.url)).toEqual(FIXTURE_TABLE.links.map((l) => urlOf(FIXTURE_TABLE, l.film)));
    expect(located.map((c) => c.lines.length)).toEqual([1, 2, 1, 1]);
    for (const c of located) {
      expect(c.page).toEqual(located[0]?.page);
      for (const [x1, y1, x2, y2] of c.lines) {
        expect(x2, c.claim).toBeGreaterThan(x1);
        expect(y2, c.claim).toBeGreaterThan(y1);
      }
    }
    // PDFKit's y runs down from the top: y 120 is 792 - 120 = 672 in page space, the baseline a little below.
    const [first] = located[0]?.lines ?? [];
    expect(first?.[0]).toBeCloseTo(54, 0);
    expect(first?.[1]).toBeLessThan(672);
    expect(first?.[3]).toBeGreaterThan(660);
    const wrapped = located[1]?.lines ?? [];
    expect(wrapped[0]?.[0]).toBeCloseTo(200, 0);
    expect(wrapped[1]?.[0]).toBeCloseTo(200, 0);
    expect(wrapped[1]?.[3]).toBeLessThanOrEqual(wrapped[0]?.[1] ?? 0);

    const missing = {
      ...FIXTURE_TABLE,
      links: [
        ...FIXTURE_TABLE.links,
        { claim: "TESTED EVERY TIME IT CHANGES", film: "evals", media: "media/evals.mp4" },
      ],
    };
    await expect(locateClaims(pdf, missing)).rejects.toThrow(/TESTED EVERY TIME IT CHANGES/);
    await expect(locateClaims(await claimsPdf({ twice: true }), FIXTURE_TABLE)).rejects.toThrow(
      /LOCAL MODELS FIRST.*twice|twice.*LOCAL MODELS FIRST/,
    );
  });

  it("4. addLinks keeps the original bytes as its prefix, adds the four links, and refuses bytes that aren't C-0002's", async () => {
    const pdf = await claimsPdf();
    const located = await locateClaims(pdf, FIXTURE_TABLE);
    const out = addLinks(pdf, located, sha256(pdf));
    expect(Buffer.from(out.subarray(0, pdf.length)).equals(pdf)).toBe(true);
    expect(out.length).toBeGreaterThan(pdf.length);
    expect(out.length - pdf.length).toBeLessThan(4000);
    const urls = FIXTURE_TABLE.links.map((l) => urlOf(FIXTURE_TABLE, l.film));
    const read = await readPdf(out);
    expect(read?.pages).toBe(1);
    expect(read?.links).toEqual([EXISTING_LINK, ...urls]);
    expect(read?.unread).toEqual([]);
    expect((await linkAnnotations(out)).map((a) => a.quads)).toEqual([0, 1, 2, 1, 1]);
    // The same input gives the same bytes: nothing time-based is written.
    expect(Buffer.from(addLinks(pdf, located, sha256(pdf))).equals(Buffer.from(out))).toBe(true);
    // The appended trailer copies the original's /ID, /Root, and /Info.
    const tail = (b: Uint8Array): string => Buffer.from(b).toString("latin1");
    const trailerOf = (s: string): string => s.slice(s.lastIndexOf("trailer"));
    for (const key of [/\/ID\s*\[[^\]]*\]/, /\/Root\s+\d+\s+\d+\s+R/, /\/Info\s+\d+\s+\d+\s+R/]) {
      const original = key.exec(trailerOf(tail(pdf)))?.[0];
      expect(original, String(key)).toBeDefined();
      expect(key.exec(trailerOf(tail(out)))?.[0], String(key)).toBe(original);
    }
    expect(() => addLinks(pdf, located, "0".repeat(64))).toThrow(/C-0002/);
  });

  it("6. every link the table makes passes PDF5's allowlist; a link to another owner fails PDF5", async () => {
    const t = table();
    expect(t, `${TABLE_PATH} is missing`).not.toBeNull();
    for (const l of t?.links ?? []) expect(allowedUrl(urlOf(t as FilmLinkTable, l.film)), l.film).toBe(true);
    for (const l of FIXTURE_TABLE.links) expect(allowedUrl(urlOf(FIXTURE_TABLE, l.film)), l.film).toBe(true);

    const pdf = await claimsPdf();
    const clean = addLinks(pdf, await locateClaims(pdf, FIXTURE_TABLE), sha256(pdf));
    expect(pdfProblems(await readPdf(clean), clean.length, LINK_RULES)).toEqual([]);
    const other = { ...FIXTURE_TABLE, repo: "https://github.com/someone-else/h4reet-ai" };
    const out = addLinks(pdf, await locateClaims(pdf, other), sha256(pdf));
    expect(pdfProblems(await readPdf(out), out.length, LINK_RULES)).toContain(
      "PDF5 a URL to a host outside the allowlist, in its links",
    );
  });
});

// ---- The tree's state and the real files (plan §3's table; FR-013) ----

type State = "before" | "published" | "neither";
const POLICY_DIR = join(REPO, "assets/policy");
const HUMAN_PATCH = "docs/merge-requests/human-patches/023.md";
const STACK_NOTE = "docs/merge-requests/2026-11-14-night-stack.md";

/** The four things the state is read from, and the state they name. The candidate file's existence is read, never
 * the candidates/ folder's. */
function treeState(): { state: State; served: string; c0002: string; recorded: string; candidate: string | null } {
  const hashOf = (path: string): string | null =>
    existsSync(join(REPO, path)) ? sha256(readFileSync(join(REPO, path))) : null;
  const served = hashOf(AUTHOR_PDF_PATH) ?? "absent";
  let c0002 = "absent";
  try {
    c0002 = c0002Sha(readPolicy(POLICY_DIR));
  } catch {
    // Named as "absent" in case 0's message.
  }
  const recorded = table()?.pdf_sha256 ?? "";
  const candidate = hashOf(CANDIDATE_PATH);
  const state: State =
    served === c0002 && candidate !== null && recorded !== "" && candidate === recorded
      ? "before"
      : recorded !== "" && served === recorded && candidate === null
        ? "published"
        : "neither";
  return { state, served, c0002, recorded: recorded || "(empty)", candidate };
}

const TREE = treeState();
/** Why a case that needs `want` skips in this tree's state, or "" when it runs. */
const skipped = (want: State): string =>
  TREE.state === want
    ? ""
    : TREE.state === "neither"
      ? "neither: see case 0"
      : TREE.state === "published"
        ? "published: the served file is the candidate"
        : "before: not published yet";
const titled = (title: string, want: State): string => (skipped(want) ? `${title} (skipped: ${skipped(want)})` : title);

const approvedBytes = (): Buffer => readFileSync(join(REPO, AUTHOR_PDF_PATH));
const candidateBytes = (): Buffer => readFileSync(join(REPO, CANDIDATE_PATH));

/** Each link annotation's URL and rectangle on page 1. */
async function linkRects(bytes: Uint8Array): Promise<{ url: string; rect: number[] }[]> {
  const task = await openPdf(bytes);
  try {
    const page = await (await task.promise).getPage(1);
    return ((await page.getAnnotations()) as Record<string, unknown>[])
      .filter((a) => a.subtype === "Link")
      .map((a) => ({ url: String(a.unsafeUrl ?? a.url), rect: [...(a.rect as ArrayLike<number>)] }));
  } finally {
    await task.destroy();
  }
}

describe("spec 023: the candidate, before and after the Author publishes it", () => {
  it('0. the tree is in the "before" or the "published" state (FR-013)', () => {
    expect(
      TREE.state,
      `neither "before" nor "published": the served file's SHA-256 is ${TREE.served}, C-0002's is ${TREE.c0002}, ` +
        `the table's pdf_sha256 is ${TREE.recorded}, and the candidate file (${CANDIDATE_PATH}) is ` +
        (TREE.candidate === null ? "absent" : `present, SHA-256 ${TREE.candidate}`),
    ).not.toBe("neither");
  });

  it.skipIf(skipped("before") !== "")(
    titled(
      "5. the candidate passes PDF1 to PDF9 under the tree's header, keeps the approved file as its prefix and its links",
      "before",
    ),
    async () => {
      const approved = approvedBytes();
      const candidate = candidateBytes();
      expect(sha256(approved)).toBe(c0002Sha(readPolicy(POLICY_DIR)));
      const header = readPolicy(POLICY_DIR).header;
      const filled =
        header?.full_name && header.contact ? { full_name: header.full_name, contact: header.contact } : null;
      expect(filled, "the tree's resume-header.json fills both slots, as main's does").not.toBeNull();
      const roomName = parseResume(readFileSync(join(REPO, RESUME_PATH), "utf8")).header.room.name;
      const { problems } = await checkAuthorPdf(candidate, { root: REPO, roomName, header: filled });
      expect(problems).toEqual([]);
      const read = await readPdf(candidate);
      expect(read?.pages).toBe(1);
      expect(candidate.subarray(0, approved.length).equals(approved)).toBe(true);
      const before = (await readPdf(approved))?.links ?? [];
      expect(before.length).toBeGreaterThan(0);
      expect(read?.links.slice(0, before.length)).toEqual(before);
      expect(read?.links.slice(before.length)).toEqual(
        (table()?.links ?? []).map((l) => urlOf(table() as FilmLinkTable, l.film)),
      );
    },
  );

  it.skipIf(skipped("before") !== "")(
    titled("7. the committed candidate is what addLinks writes from the approved file and the table", "before"),
    async () => {
      const approved = approvedBytes();
      const t = readTable(REPO);
      const written = addLinks(approved, await locateClaims(approved, t), c0002Sha(readPolicy(POLICY_DIR)));
      expect(Buffer.from(written).equals(candidateBytes())).toBe(true);
    },
  );

  it.skipIf(skipped("before") !== "")(
    titled("8. the appended section holds only the page object and four invisible link annotations", "before"),
    () => {
      const approved = approvedBytes().toString("latin1");
      const appended = candidateBytes().toString("latin1").slice(approved.length);
      const objects = [...appended.matchAll(/(\d+) (\d+) obj\n([\s\S]*?)\nendobj\n/g)];
      const rest = appended.replace(/(\d+) (\d+) obj\n([\s\S]*?)\nendobj\n/g, "");
      expect(rest).toMatch(/^\n?xref\n(?:\d+ \d+\n(?:\d{10} \d{5} n \n)+)+trailer\n<<[^]*>>\nstartxref\n\d+\n%%EOF\n$/);
      expect(objects).toHaveLength(5);
      const urls = (table()?.links ?? []).map((l) => urlOf(table() as FilmLinkTable, l.film));
      const links = objects.filter((o) => /\/Subtype \/Link\b/.test(o[3] ?? ""));
      const pages = objects.filter((o) => /\/Type \/Page\b/.test(o[3] ?? ""));
      expect(links).toHaveLength(4);
      expect(pages).toHaveLength(1);
      const [page] = pages;
      const original = new RegExp(`(?<![0-9])${page?.[1]} ${page?.[2]} obj\\n([\\s\\S]*?)\\nendobj`).exec(
        approved,
      )?.[1];
      expect(original, "the page object is the approved file's, by number").toBeDefined();
      const annots = (body: string): string => /\/Annots \[([^\]]*)\]/.exec(body)?.[1]?.trim() ?? "";
      const refs = links.map((o) => `${o[1]} ${o[2]} R`).join(" ");
      expect(annots(page?.[3] ?? "")).toBe(`${annots(original ?? "")} ${refs}`);
      expect((page?.[3] ?? "").replace(/\/Annots \[[^\]]*\]/, "")).toBe(
        (original ?? "").replace(/\/Annots \[[^\]]*\]/, ""),
      );
      for (const [, , , body = ""] of links) {
        expect(body).toMatch(/\/Type \/Annot\b/);
        expect(body).toContain("/Border [0 0 0]");
        expect(urls).toContain(/\/URI \(([^)]*)\)/.exec(body)?.[1]);
        for (const key of ["AP", "C", "JS", "Launch"]) expect(body, key).not.toMatch(new RegExp(`/${key}\\b`));
      }
      expect(links.map((o) => /\/URI \(([^)]*)\)/.exec(o[3] ?? "")?.[1])).toEqual(urls);
    },
  );

  it.skipIf(skipped("before") !== "")(
    titled(
      "9. the human patch and the stack note quote the table's pdf_sha256, and the edit text holds its URLs",
      "before",
    ),
    () => {
      const t = readTable(REPO);
      const quoted = (text: string): string | undefined => /Candidate SHA-256: `([^`]*)`/.exec(text)?.[1];
      const patch = readFileSync(join(REPO, HUMAN_PATCH), "utf8");
      expect(quoted(patch), HUMAN_PATCH).toBe(t.pdf_sha256);
      const note = readFileSync(join(REPO, STACK_NOTE), "utf8");
      const start = note.search(/^## Item \d+: spec 023\b/m);
      expect(start, `${STACK_NOTE} has an item for spec 023`).toBeGreaterThanOrEqual(0);
      const after = note.slice(start + 1).search(/^## /m);
      const item = after < 0 ? note.slice(start) : note.slice(start, start + 1 + after);
      expect(quoted(item), `${STACK_NOTE}, item for 023`).toBe(t.pdf_sha256);
      const edit = [...item.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
      expect(edit, "the edit text for his source, an html block in the item").not.toBe("");
      for (const l of t.links) expect(edit, l.film).toContain(`href="${urlOf(t, l.film)}"`);
    },
  );

  it.skipIf(skipped("published") !== "")(
    titled("10. the served file's links hold the table's four URLs, one over each claim", "published"),
    async () => {
      const served = approvedBytes();
      const t = readTable(REPO);
      const links = await linkRects(served);
      for (const claim of await locateClaims(served, t)) {
        const over = links.filter(
          (l) =>
            l.url === claim.url &&
            claim.lines.some(
              ([x1, y1, x2, y2]) =>
                (l.rect[0] ?? 0) < x2 && (l.rect[2] ?? 0) > x1 && (l.rect[1] ?? 0) < y2 && (l.rect[3] ?? 0) > y1,
            ),
        );
        expect(over, claim.claim).toHaveLength(1);
      }
    },
  );

  // T007's writer: an explicit opt-in (WRITE_CANDIDATE=1), never part of a plain run (plan §2).
  it.runIf(process.env.WRITE_CANDIDATE === "1")(
    "writes the candidate from the approved file and records its SHA-256 in the table (WRITE_CANDIDATE=1 only)",
    async () => {
      const approved = approvedBytes();
      const t = readTable(REPO);
      const written = addLinks(approved, await locateClaims(approved, t), c0002Sha(readPolicy(POLICY_DIR)));
      writeFileSync(join(REPO, CANDIDATE_PATH), written);
      const path = join(REPO, TABLE_PATH);
      const text = readFileSync(path, "utf8");
      const updated = text.replace(/"pdf_sha256": "[0-9a-f]*"/, `"pdf_sha256": "${sha256(written)}"`);
      expect(updated).not.toBe(text);
      writeFileSync(path, updated);
    },
  );
});
