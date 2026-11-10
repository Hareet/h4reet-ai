// The Author's designed PDF (spec 002's amendment of 2026-11-09; contracts/resume-source.md §7; plan §2, "The Author's
// PDF"). His own resume, apps/web/content/resume-author.pdf, which he commits himself, takes the render's place as
// resume.pdf when main approves its SHA-256 and main's resume-header.json fills both slots; build/content.ts's
// resumePart decides that and emits it. This file reads the PDF with pdf.js and holds it to PDF1 to PDF9, each problem
// reported by its rule and where it was found, never by the words:
//   PDF1  a PDF pdf.js reads;
//   PDF2  at most PDF_MAX_BYTES bytes and PDF_MAX_PAGES pages;
//   PDF3  text the checks can read: some, holding main's full name when the header is filled, every glyph mapped to a
//         character;
//   PDF4  no phrase of C9's list: the corpus's "Do not claim" key phrases, and the private denylist's where the build
//         can read it;
//   PDF5  every URL, written or linked, to a host PDF_LINKS names, and every link http, https, or mailto;
//   PDF6  no phone number's shape;
//   PDF7  no email address but main's contact (with the header filled);
//   PDF8  the surname only inside main's full name and contact (with the header filled);
//   PDF9  nothing the checks can't read: no attachment, JavaScript, form field, other annotation than a link, or XMP
//         metadata stream.
// Each rule reads three places: the text as pdfText gives it (resume.pdf.txt), each link annotation's target, and
// Info's text values. PDF4 and PDF8 read them with main's full name and contact taken out, since FR-017 puts those on
// the PDF. C9's list, the surname rule, and the text's normalizing are build/content.ts's, handed in as PdfRules.
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import { documentText, openPdf } from "./pdf";

/** Where the Author puts his PDF, from the repository's root. */
export const AUTHOR_PDF_PATH = "apps/web/content/resume-author.pdf";
/** PDF2's caps: his file is one page and about 240 KB. */
export const PDF_MAX_BYTES = 1_000_000;
export const PDF_MAX_PAGES = 2;

/** A host the PDF may name or link to, a subdomain of it included, and the corpus file that names it, with the words
 * there (test/content/author-pdf.test.ts finds them in the file). `path`, when set, is the URL's first path segment,
 * compared case-blind: github.com is allowed only as the Author's own account. */
export interface PdfHost {
  readonly host: string;
  readonly path?: string;
  readonly source: string;
  readonly attested: string;
}

export const PDF_LINKS: readonly PdfHost[] = [
  { host: "hareet.ai", source: "corpus/08-hareet-ai.md", attested: "hareet.ai" },
  { host: "denverlocal.ai", source: "corpus/07-denver-local-ai.md", attested: "denverlocal.ai" },
  { host: "github.com", path: "hareet", source: "corpus/00-profile.md", attested: "github.com/Hareet" },
];

/** What the checks read of a PDF. */
export interface PdfRead {
  pages: number;
  /** pdfText's text, which the build writes to resume.pdf.txt. */
  text: string;
  /** Each link annotation's target, as the file writes it. */
  links: string[];
  /** Info's text values: Title, Author, Subject, Keywords, Creator, Producer, and any custom key's. */
  properties: string[];
  /** PDF9: what the file holds that the checks can't read. */
  unread: string[];
}

/** What build/content.ts hands the checks. */
export interface PdfRules {
  /** main's resume-header.json, both slots filled (FR-017), or null: then PDF3 asks only for text, and PDF7 and PDF8
   * aren't checked. */
  readonly header: { readonly full_name: string; readonly contact: string } | null;
  /** C9's normalizing: lowercase, no Markdown marks, quotes straightened, whitespace collapsed. */
  normalize(text: string): string;
  /** Every phrase of C9's list a normalized string holds, by its source; the surname rule's marked. Never the words. */
  forbidden(shown: string): { surname: boolean; source: string }[];
}

type Where = "text" | "links" | "properties";

const PROPERTIES = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"] as const;

/** The PDF, read for the checks; null when pdf.js can't read it (PDF1). */
export async function readPdf(bytes: Uint8Array): Promise<PdfRead | null> {
  const task = await openPdf(bytes);
  try {
    return await readDocument(await task.promise);
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): boolean =>
  v instanceof Map ? v.size > 0 : Array.isArray(v) ? v.length > 0 : isRecord(v) && Object.keys(v).length > 0;

async function readDocument(doc: PDFDocumentProxy): Promise<PdfRead> {
  const links: string[] = [];
  const unread = new Set<string>();
  if (nonEmpty(await doc.getAttachments())) unread.add("an attachment");
  if (nonEmpty(await doc.getJSActions()) || (await doc.hasJSActions())) unread.add("JavaScript");
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    if (nonEmpty(await page.getJSActions())) unread.add("JavaScript");
    for (const annotation of (await page.getAnnotations()) as Record<string, unknown>[]) {
      if (annotation.subtype === "FileAttachment" || annotation.attachment !== undefined) unread.add("an attachment");
      else if (annotation.subtype === "Widget") unread.add("a form field");
      // A note, a highlight's comment, a stamp, or a popup holds words the text doesn't (the review of 9320b778).
      else if (annotation.subtype !== "Link") unread.add("an annotation other than a link");
      if (nonEmpty(annotation.actions)) unread.add("JavaScript");
      const target = annotation.unsafeUrl ?? annotation.url;
      if (annotation.subtype === "Link" && typeof target === "string") links.push(target);
    }
  }
  const { info, metadata } = await doc.getMetadata();
  if (metadata !== null) unread.add("an XMP metadata stream");
  const properties: string[] = [];
  if (isRecord(info)) {
    for (const key of PROPERTIES) if (typeof info[key] === "string") properties.push(info[key]);
    if (isRecord(info.Custom))
      for (const v of Object.values(info.Custom)) if (typeof v === "string") properties.push(v);
  }
  return { pages: doc.numPages, text: await documentText(doc), links, properties, unread: [...unread] };
}

// ---- The rules ----

const EMAIL = /[\p{L}\p{N}._%+-]+@(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}/gu;
/** A URL written out: a scheme's or www.'s, to the first space, quote, or bracket. */
const WRITTEN_URL = /(?<![\p{L}\p{N}])(?:https?:\/\/|www\.)[^\s<>"'()[\]{}]+/giu;
/** A bare domain with a common top-level domain written lowercase, and its path: "github.com/Hareet", "hareet.ai".
 * A name like "Node.js" or "ASP.NET" isn't one. */
const TLDS =
  "com|org|net|edu|gov|int|io|ai|dev|app|co|me|info|xyz|tech|cloud|site|page|link|online|health|ngo|us|uk|ca|au|de|eu|in|ke|ug|nz|tv|fm|gg|ly";
const BARE_DOMAIN = new RegExp(
  `(?<![\\p{L}\\p{N}@._/-])(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]*[\\p{L}\\p{N}])?\\.)+(?:${TLDS})(?![\\p{L}\\p{N}-])(?:/[^\\s<>"'()[\\]{}]*)?`,
  "gu",
);
const TRAILING = /[.,;:!?]+$/;
/** PDF6: a number from a plus, of 8 to 15 digits; a North American one, three, three, and four; or that with its
 * country code, 1, before it ("1-303-…", the review of 9320b778). */
const PHONES = [
  /(?<![\p{L}\p{N}])\+\d(?:[\s.()-]{0,2}\d){7,14}(?!\p{N})/u,
  /(?<![\p{L}\p{N}.+-])(?:\(\d{3}\)|\d{3})[\s.-]{0,2}\d{3}[\s.-]?\d{4}(?!\p{N})/u,
  /(?<![\p{L}\p{N}])1[\s.-]\(?\d{3}\)?[\s.-]{0,2}\d{3}[\s.-]?\d{4}(?!\p{N})/u,
];
/** PDF3: what pdf.js gives for a glyph it can't map to a character: the replacement character, a private-use code
 * point, or a control character (whitespace is collapsed before this reads it). */
const UNMAPPED = /[\uFFFD\p{Co}\p{Cc}]/u;

/** PDF5: an http or https URL to a host PDF_LINKS names, with no user in it. */
export function allowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const first = decoded(parsed.pathname.split("/")[1] ?? "").toLowerCase();
  return PDF_LINKS.some(
    (l) => (host === l.host || host.endsWith(`.${l.host}`)) && (l.path === undefined || first === l.path),
  );
}

/** Every URL a text writes out, a bare domain's as https, its trailing punctuation dropped. */
export function urlsIn(text: string): string[] {
  const urls: string[] = [];
  const rest = text.replace(WRITTEN_URL, (url) => {
    const clean = url.replace(TRAILING, "");
    urls.push(/^www\./i.test(clean) ? `https://${clean}` : clean);
    return " ";
  });
  for (const m of rest.matchAll(BARE_DOMAIN)) urls.push(`https://${m[0].replace(TRAILING, "")}`);
  return urls;
}

const sameAddress = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A URL part with its escapes undone, or as it is when one is malformed: then it matches no address. */
function decoded(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** What PDF4 and PDF8 read of a string: C9's normalizing, then main's full name and contact taken out, since FR-017
 * puts them on the PDF, and the result normalized again. */
export function shownOf(value: string, rules: PdfRules): string {
  let shown = rules.normalize(value);
  if (rules.header)
    for (const part of [rules.header.full_name, rules.header.contact])
      shown = shown.split(rules.normalize(part)).join(" ");
  return rules.normalize(shown);
}

/** PDF4's input, one line for each place it reads: the text, each link's target, and each property's value, as
 * shownOf gives them. The Author's step 0 counts his denylist's phrases in these lines (the merge note). */
export function pdf4Lines(read: PdfRead, rules: PdfRules): string[] {
  return [read.text, ...read.links, ...read.properties].map((value) => shownOf(value, rules));
}

/** One string's problems, in rule order, without the place. */
function problemsIn(value: string, where: Where, rules: PdfRules): string[] {
  const out: string[] = [];
  const { header } = rules;
  // PDF4 and PDF8: C9's list, with main's full name and contact taken out.
  const hits = rules.forbidden(shownOf(value, rules));
  for (const hit of hits) if (!hit.surname) out.push(`PDF4 forbidden phrase (from ${hit.source})`);
  // PDF5 and PDF7: a link's target by its scheme; written URLs and email addresses in the rest.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value.trim())?.[1]?.toLowerCase();
  if (where === "links" && scheme === "mailto") {
    const to = decoded(value.trim().slice("mailto:".length).split("?")[0] ?? "").split(",");
    if (header && to.some((address) => !sameAddress(address, header.contact)))
      out.push("PDF7 an email address other than main's contact");
  } else if (where === "links" && scheme !== "http" && scheme !== "https") {
    out.push(scheme === "tel" ? "PDF6 a phone number's shape" : "PDF5 a link that isn't http, https, or mailto");
  } else if (where === "links") {
    if (!allowedUrl(value.trim())) out.push("PDF5 a URL to a host outside the allowlist");
  } else {
    const emails = value.match(EMAIL) ?? [];
    if (urlsIn(value.replace(EMAIL, " ")).some((url) => !allowedUrl(url)))
      out.push("PDF5 a URL to a host outside the allowlist");
    if (header && emails.some((address) => !sameAddress(address, header.contact)))
      out.push("PDF7 an email address other than main's contact");
  }
  if (PHONES.some((phone) => phone.test(value))) out.push("PDF6 a phone number's shape");
  if (hits.some((hit) => hit.surname)) out.push("PDF8 the surname outside main's full name and contact");
  return out;
}

/** PDF1 to PDF9 over what readPdf read of a file of `size` bytes: each problem once for each place it's in. */
export function pdfProblems(read: PdfRead | null, size: number, rules: PdfRules): string[] {
  if (read === null) return ["PDF1 not a PDF that pdf.js reads"];
  const problems = new Set<string>();
  if (size > PDF_MAX_BYTES) problems.add(`PDF2 over ${PDF_MAX_BYTES.toLocaleString("en-US")} bytes`);
  if (read.pages > PDF_MAX_PAGES) problems.add(`PDF2 over ${PDF_MAX_PAGES} pages`);
  if (read.text.trim() === "") problems.add("PDF3 no text the checks can read");
  else if (rules.header && !rules.normalize(read.text).includes(rules.normalize(rules.header.full_name)))
    problems.add("PDF3 its text doesn't hold main's full name, so the checks may not be reading its text");
  else if (UNMAPPED.test(read.text)) problems.add("PDF3 text pdf.js couldn't map to characters");
  const places: [Where, string[]][] = [
    ["text", [read.text]],
    ["links", read.links],
    ["properties", read.properties],
  ];
  for (const [where, values] of places) {
    for (const value of values)
      for (const problem of problemsIn(value, where, rules)) problems.add(`${problem}, in its ${where}`);
  }
  for (const what of read.unread) problems.add(`PDF9 ${what}, which the checks can't read`);
  return [...problems];
}
