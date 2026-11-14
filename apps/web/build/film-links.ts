// Spec 023: the resume PDF, redone with links from the films (plan §2). The claim-to-film table is one file,
// films/resume-links.json (FR-003). locateClaims finds each claim's text on the Author's approved PDF with pdf.js;
// addLinks appends an incremental update to the file: the page object again, under its own number, with /Annots
// extended, and one invisible link annotation a claim (no /AP, no colour, no border), then an xref section and a
// trailer with /Prev. The original bytes stay the file's prefix (SC-004), and nothing time-based is written, so the
// same input gives the same bytes (plan §3, case 7). The writer runs only on the file C-0002 approves (FR-006); no
// check requires the served file to be C-0002's (FR-013). There is no command line: the candidate is written by one
// opt-in vitest case (test/content/film-links.test.ts), so nothing the Author runs executes this file.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Policy } from "./approvals";
import { openPdf } from "./pdf";

/** Where the table lives, from the repository's root. */
export const FILM_LINKS_PATH = "films/resume-links.json";
/** Where the candidate waits for the Author's approval, from the repository's root; no build step reads it (FR-008). */
export const CANDIDATE_PATH = "apps/web/content/candidates/resume-author-links.pdf";

export interface FilmLink {
  /** The claim's words as the PDF shows them; matched case-blind, whitespace ignored. */
  claim: string;
  /** The film's folder under films/. */
  film: string;
  /** The film's MP4, inside its folder, as its README's "Watch the film" links it. */
  media: string;
}

export interface FilmLinkTable {
  schema: 1;
  /** The repository's URL, from the corpus (corpus/08-hareet-ai.md). */
  repo: string;
  /** The candidate's SHA-256, or "" before T007 writes it: the hash's only home in the tree. */
  pdf_sha256: string;
  links: FilmLink[];
}

/** A claim found on the PDF: its page, and one rectangle [x1, y1, x2, y2] in page space a line it runs over. */
export interface LocatedClaim {
  claim: string;
  url: string;
  page: { num: number; gen: number };
  lines: [number, number, number, number][];
}

/** A film's landing page: repo/tree/main/films/<film> (FR-002). */
export const filmUrl = (table: FilmLinkTable, film: string): string => `${table.repo}/tree/main/films/${film}`;

/** The table, from a repository's root. */
export function readTable(root: string): FilmLinkTable {
  return JSON.parse(readFileSync(join(root, FILM_LINKS_PATH), "utf8")) as FilmLinkTable;
}

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const squash = (text: string): string => text.replace(/\s+/g, "").toLowerCase();

/** C-0002's SHA-256, read from main's content-approvals.json in the policy; never copied anywhere. */
export function c0002Sha(policy: Policy): string {
  const file = policy.files["content-approvals.json"];
  if (file === null) throw new Error("film-links: the policy holds no content-approvals.json, so no C-0002");
  const { approvals } = JSON.parse(file.toString("utf8")) as { approvals?: { id?: unknown; sha256?: unknown }[] };
  const sha = approvals?.find((a) => a.id === "C-0002")?.sha256;
  if (typeof sha !== "string" || !/^[0-9a-f]{64}$/.test(sha))
    throw new Error("film-links: content-approvals.json has no C-0002 with a SHA-256");
  return sha;
}

// ---- The locator ----

/** How far a link's box reaches above and below a line's baseline, in font sizes. */
const ASCENT = 0.9;
const DESCENT = 0.2;

interface Run {
  page: { num: number; gen: number };
  key: string;
  x: number;
  y: number;
  size: number;
  width: number;
}

/** Each claim of the table, found once on the PDF, in the table's order. Fails naming the claim when its text isn't
 * there, or is there more than once. A claim is a sequence of whole text runs; whitespace-only runs between them are
 * skipped, so a claim that wraps is found over its lines. */
export async function locateClaims(pdf: Uint8Array, table: FilmLinkTable): Promise<LocatedClaim[]> {
  const runs: Run[] = [];
  const task = await openPdf(pdf);
  try {
    const doc = await task.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const page_ref = { num: page.ref?.num ?? 0, gen: page.ref?.gen ?? 0 };
      for (const item of (await page.getTextContent()).items) {
        if (!("str" in item)) continue;
        const key = squash(item.str);
        if (key === "") continue;
        const [a, b, c, d, x, y] = item.transform as number[];
        if (b !== 0 || c !== 0)
          throw new Error(`film-links: rotated text on page ${n}, which the locator doesn't read`);
        runs.push({ page: page_ref, key, x: x ?? 0, y: y ?? 0, size: Math.max(a ?? 0, d ?? 0), width: item.width });
      }
    }
  } finally {
    await task.destroy();
  }
  return table.links.map((link) => {
    const target = squash(link.claim);
    const found: Run[][] = [];
    for (let i = 0; i < runs.length; i++) {
      let text = "";
      for (let j = i; j < runs.length; j++) {
        text += runs[j]?.key ?? "";
        if (!target.startsWith(text)) break;
        if (text === target) {
          found.push(runs.slice(i, j + 1));
          break;
        }
      }
    }
    if (found.length === 0) throw new Error(`film-links: the claim "${link.claim}" isn't on the PDF`);
    if (found.length > 1) throw new Error(`film-links: the claim "${link.claim}" is on the PDF twice or more`);
    const match = found[0] as Run[];
    const first = match[0] as Run;
    if (match.some((r) => r.page.num !== first.page.num))
      throw new Error(`film-links: the claim "${link.claim}" runs over two pages`);
    const lines: [number, number, number, number][] = [];
    const baselines: number[] = [];
    for (const run of match) {
      const at = baselines.findIndex((y) => Math.abs(y - run.y) < run.size / 4);
      const box: [number, number, number, number] = [
        run.x,
        run.y - DESCENT * run.size,
        run.x + run.width,
        run.y + ASCENT * run.size,
      ];
      const line = lines[at];
      if (at < 0 || !line) {
        baselines.push(run.y);
        lines.push(box);
      } else {
        lines[at] = [
          Math.min(line[0], box[0]),
          Math.min(line[1], box[1]),
          Math.max(line[2], box[2]),
          Math.max(line[3], box[3]),
        ];
      }
    }
    return { claim: link.claim, url: filmUrl(table, link.film), page: first.page, lines };
  });
}

// ---- The writer ----

/** A number as the update writes it: at most three decimals, no exponent, no trailing zeros. */
const num = (n: number): string => {
  const fixed = n.toFixed(3).replace(/\.?0+$/, "");
  return fixed === "-0" ? "0" : fixed;
};

/** A PDF literal string: backslash and parentheses escaped, anything outside printable ASCII as an octal escape. */
const pdfString = (text: string): string =>
  `(${[...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (ch === "\\" || ch === "(" || ch === ")") return `\\${ch}`;
      if (code < 0x20 || code > 0x7e || ch.length > 1) throw new Error(`film-links: a URL with ${JSON.stringify(ch)}`);
      return ch;
    })
    .join("")})`;

interface Xref {
  /** Each in-use object's byte offset, by "num gen", the latest section's winning. */
  offsets: Map<string, number>;
  /** The latest trailer's dictionary text. */
  trailer: string;
  /** The latest xref section's offset: the update's /Prev. */
  start: number;
}

/** The classic xref sections, the latest first, followed by /Prev. A file whose xref is a stream (or a hybrid's
 * /XRefStm) is refused: R-1's spike found the approved file a classic table, so the writer reads only that. */
function readXref(text: string): Xref {
  const tail = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text.slice(-1024));
  if (!tail?.[1]) throw new Error("film-links: no startxref at the PDF's end");
  const start = Number(tail[1]);
  const offsets = new Map<string, number>();
  let trailer: string | null = null;
  const seen = new Set<number>();
  for (let at: number | null = start; at !== null;) {
    if (seen.has(at)) throw new Error("film-links: the xref's /Prev chain loops");
    seen.add(at);
    if (!text.startsWith("xref", at)) throw new Error("film-links: the PDF's xref isn't a classic table (plan R-1)");
    const end = text.indexOf("trailer", at);
    if (end < 0) throw new Error("film-links: an xref section without a trailer");
    const lines = text
      .slice(at + 4, end)
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "");
    for (let i = 0; i < lines.length;) {
      const head = /^(\d+) (\d+)$/.exec(lines[i] ?? "");
      if (!head) throw new Error(`film-links: an xref subsection header the writer can't read: ${lines[i]}`);
      const first = Number(head[1]);
      const count = Number(head[2]);
      for (let k = 0; k < count; k++) {
        const entry = /^(\d{10}) (\d{5}) ([nf])$/.exec(lines[i + 1 + k] ?? "");
        if (!entry) throw new Error("film-links: an xref entry the writer can't read");
        const key = `${first + k} ${Number(entry[2])}`;
        if (entry[3] === "n" && !offsets.has(key)) offsets.set(key, Number(entry[1]));
      }
      i += 1 + count;
    }
    const dict = dictAt(text, text.indexOf("<<", end));
    trailer ??= dict;
    if (/\/Encrypt\b/.test(dict)) throw new Error("film-links: an encrypted PDF");
    if (/\/XRefStm\b/.test(dict))
      throw new Error("film-links: a hybrid xref (/XRefStm), which the writer doesn't read");
    const prev = /\/Prev\s+(\d+)/.exec(dict)?.[1];
    at = prev === undefined ? null : Number(prev);
  }
  return { offsets, trailer: trailer ?? "", start };
}

/** The dictionary that starts at `at` ("<<"), to its matching ">>", strings and nesting skipped. */
function dictAt(text: string, at: number): string {
  if (at < 0 || !text.startsWith("<<", at)) throw new Error("film-links: a dictionary the writer can't find");
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      // A literal string: skip to its close, nested parentheses and escapes counted.
      let open = 1;
      for (i++; i < text.length && open > 0; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === "(") open++;
        else if (text[i] === ")") open--;
      }
      i--;
    } else if (text.startsWith("<<", i)) {
      depth++;
      i++;
    } else if (text.startsWith(">>", i)) {
      depth--;
      i++;
      if (depth === 0) return text.slice(at, i + 1);
    }
  }
  throw new Error("film-links: a dictionary without its end");
}

/** An object's body, between "num gen obj" and "endobj". */
function objectBody(text: string, xref: Xref, num: number, gen: number): string {
  const at = xref.offsets.get(`${num} ${gen}`);
  if (at === undefined) throw new Error(`film-links: object ${num} ${gen} isn't in the classic xref`);
  const head = new RegExp(`^${num}\\s+${gen}\\s+obj\\b`).exec(text.slice(at, at + 32));
  if (!head) throw new Error(`film-links: object ${num} ${gen} isn't at its xref offset`);
  const end = text.indexOf("endobj", at);
  if (end < 0) throw new Error(`film-links: object ${num} ${gen} has no endobj`);
  return text.slice(at + head[0].length, end).trim();
}

/** The PDF with one link annotation a claim appended as an incremental update. Refuses a file whose SHA-256 isn't
 * `c0002`, the hash content-approvals.json gives C-0002 (FR-006; c0002Sha reads it). */
export function addLinks(pdf: Uint8Array, claims: readonly LocatedClaim[], c0002: string): Uint8Array {
  const actual = sha256(pdf);
  if (actual !== c0002)
    throw new Error(
      `film-links: the PDF's SHA-256 is ${actual}, not C-0002's (${c0002}); the writer runs only on that file`,
    );
  const text = Buffer.from(pdf).toString("latin1");
  const xref = readXref(text);
  const size = Number(/\/Size\s+(\d+)/.exec(xref.trailer)?.[1] ?? NaN);
  if (!Number.isInteger(size)) throw new Error("film-links: the trailer has no /Size");

  const objects = new Map<number, { gen: number; body: string }>();
  let next = size;
  const pages = new Map<string, { num: number; gen: number; refs: string[] }>();
  for (const claim of claims) {
    const key = `${claim.page.num} ${claim.page.gen}`;
    const page = pages.get(key) ?? { ...claim.page, refs: [] };
    pages.set(key, page);
    const rect = claim.lines.reduce((r, l) => [
      Math.min(r[0], l[0]),
      Math.min(r[1], l[1]),
      Math.max(r[2], l[2]),
      Math.max(r[3], l[3]),
    ]);
    const quads = claim.lines.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1]);
    objects.set(next, {
      gen: 0,
      body: [
        "<</Type /Annot",
        "/Subtype /Link",
        "/F 4",
        "/Border [0 0 0]",
        `/Rect [${rect.map(num).join(" ")}]`,
        `/QuadPoints [${quads.map(num).join(" ")}]`,
        "/A <</Type /Action",
        "/S /URI",
        `/URI ${pdfString(claim.url)}>>>>`,
      ].join("\n"),
    });
    page.refs.push(`${next} 0 R`);
    next++;
  }
  for (const page of pages.values()) {
    const body = objectBody(text, xref, page.num, page.gen);
    if (!body.startsWith("<<") || !body.endsWith(">>") || /\bstream\b/.test(body))
      throw new Error(`film-links: page object ${page.num} ${page.gen} isn't a plain dictionary`);
    const added = page.refs.join(" ");
    const inline = /\/Annots\s*\[([^\]]*)\]/.exec(body);
    const indirect = /\/Annots\s+(\d+)\s+(\d+)\s+R/.exec(body);
    let updated: string;
    if (inline) updated = body.replace(inline[0], `/Annots [${[inline[1]?.trim(), added].filter(Boolean).join(" ")}]`);
    else if (indirect) {
      const array = objectBody(text, xref, Number(indirect[1]), Number(indirect[2]));
      const kept = /^\[([^\]]*)\]$/.exec(array)?.[1];
      if (kept === undefined) throw new Error("film-links: an /Annots object that isn't an array of references");
      updated = body.replace(indirect[0], `/Annots [${[kept.trim(), added].filter(Boolean).join(" ")}]`);
    } else updated = `${body.slice(0, -2)}\n/Annots [${added}]>>`;
    objects.set(page.num, { gen: page.gen, body: updated });
  }

  // The update: each object, then the xref section, then the trailer, which keeps the original's /Root, /Info, and
  // /ID as they are and adds /Prev; nothing time-based.
  const base = text.endsWith("\n") ? "" : "\n";
  let update = base;
  const at = new Map<number, number>();
  for (const [n, object] of [...objects.entries()].sort((a, b) => a[0] - b[0])) {
    at.set(n, pdf.length + Buffer.byteLength(update, "latin1"));
    update += `${n} ${object.gen} obj\n${object.body}\nendobj\n`;
  }
  const xrefAt = pdf.length + Buffer.byteLength(update, "latin1");
  update += "xref\n";
  const nums = [...at.keys()].sort((a, b) => a - b);
  for (let i = 0; i < nums.length;) {
    let j = i;
    while (j + 1 < nums.length && (nums[j + 1] as number) === (nums[j] as number) + 1) j++;
    update += `${nums[i]} ${j - i + 1}\n`;
    for (let k = i; k <= j; k++) {
      const n = nums[k] as number;
      update += `${String(at.get(n)).padStart(10, "0")} ${String(objects.get(n)?.gen ?? 0).padStart(5, "0")} n \n`;
    }
    i = j + 1;
  }
  const keep = (key: string): string | null =>
    new RegExp(`/${key}\\s*(\\d+\\s+\\d+\\s+R|\\[[^\\]]*\\])`).exec(xref.trailer)?.[0] ?? null;
  const trailer = [`/Size ${Math.max(size, next)}`, keep("Root"), keep("Info"), keep("ID"), `/Prev ${xref.start}`]
    .filter((entry): entry is string => entry !== null)
    .join("\n");
  update += `trailer\n<<${trailer}>>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.concat([Buffer.from(pdf), Buffer.from(update, "latin1")]);
}
