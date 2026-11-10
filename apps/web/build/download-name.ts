// The PDF's download name at build time (spec 002's amendment of 2026-11-09; contracts/resume-source.md §7): the
// Author's file name, from main's resume-header.json in the policy directory, so no source file holds his surname
// (the review of 9320b778). The plugin defines __PDF_FILE_NAME__, which src/resume/download.ts reads, and writes the
// name into index.html's plain link, whose source holds the fallback. While either header slot is empty, the name is
// the fallback, as FR-017 gives the PDF the room's header.
import type { Plugin } from "vite";

import { PDF_FILE_FALLBACK, pdfFileNameFor } from "../src/resume/download";
import { pdfHeader, readPolicy, type Policy } from "./approvals";

/** The name under main's policy: the full name's when resume-header.json fills both slots, else the fallback. */
export function pdfDownloadName(policy: Policy): string {
  return pdfFileNameFor(pdfHeader(policy)?.full_name ?? null);
}

/** The attribute index.html's source writes, which the build replaces. */
const SOURCE_ATTRIBUTE = `download="${PDF_FILE_FALLBACK}"`;

/** The Vite plugin: main's policy read when the build starts, the name defined for the scripts, and written into every
 * page's link that holds the fallback. The name holds letters, digits, hyphens, and its suffix alone. */
export function resumeDownloadName(options: { policyDir: () => string }): Plugin {
  let name = PDF_FILE_FALLBACK;
  return {
    name: "h4-resume-download-name",
    config() {
      name = pdfDownloadName(readPolicy(options.policyDir()));
      return { define: { __PDF_FILE_NAME__: JSON.stringify(name) } };
    },
    transformIndexHtml(html) {
      return html.split(SOURCE_ATTRIBUTE).join(`download="${name}"`);
    },
  };
}
