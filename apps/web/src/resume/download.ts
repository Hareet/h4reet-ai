// The resume's PDF as every link names it (spec 002, FR-018; the amendment of 2026-11-09, contracts/resume-source.md
// §7): the file the build emits beside the page, ./resume.pdf, whichever PDF it is, and the name a visitor's browser
// saves it under. That name is the Author's file name, from main's resume-header.json: the full name, its words joined
// by hyphens, then "-Resume-hareet-ai.pdf", and "Resume-hareet-ai.pdf" while either slot is empty (FR-017's WHILE
// clause). No source file holds it: build/download-name.ts defines __PDF_FILE_NAME__ for the scripts and writes the
// name into index.html's plain link, which holds the fallback in the source.
export const PDF_HREF = "./resume.pdf";
export const PDF_FILE_FALLBACK = "Resume-hareet-ai.pdf";
const SUFFIX = "-Resume-hareet-ai.pdf";

/** The name for a full name: its words, each kept to letters, digits, and hyphens, joined by hyphens, then the
 * suffix; the fallback when none is left. */
export function pdfFileNameFor(fullName: string | null): string {
  const words = (fullName ?? "")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter(Boolean);
  return words.length > 0 ? `${words.join("-")}${SUFFIX}` : PDF_FILE_FALLBACK;
}

/** Replaced by the build with the name, a string literal (build/download-name.ts); undefined where nothing defines it,
 * as under the unit tests. */
declare const __PDF_FILE_NAME__: string | undefined;

/** The name the links save the PDF under. */
export function pdfFileName(): string {
  return typeof __PDF_FILE_NAME__ === "string" ? __PDF_FILE_NAME__ : PDF_FILE_FALLBACK;
}
