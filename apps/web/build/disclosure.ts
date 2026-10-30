// The data-flow disclosure page (spec 002, T010; FR-004, FR-058; plan §8): docs/data-flow-disclosure.md, rendered
// into dist/disclosure/index.html at build, so the page the site links is the file the repository reviews. It is the
// page spec 001's draft plans in its §8.1, built here first.
//
// The renderer reads the subset of Markdown the disclosure uses: ATX headings, paragraphs, "- " lists, pipe tables,
// code spans, and bold. A link keeps its text only, since the repository's relative paths don't exist on the site.
// Every character of the source is escaped, so the page holds no markup but what this file writes.
import { readFileSync } from "node:fs";

import type { Plugin } from "vite";

const AI_DISCLOSURE = "You're talking with an AI representation of the Author, not the Author.";

const STYLE = `body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 0 auto; max-width: 90rem; padding: 1rem; }
header { border-bottom: 1px solid #555; margin-bottom: 1rem; }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid #555; padding: 0.4rem; text-align: left; vertical-align: top; }
code { font-family: ui-monospace, monospace; font-size: 0.95em; }
a { color: #0b4f9c; }
a:focus-visible { outline: 2px solid #0b4f9c; outline-offset: 2px; }
`;

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Code spans first (their content is literal), then bold and links in the text between them. */
function inline(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return `<code>${escape(part.slice(1, -1))}</code>`;
      return escape(part)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    })
    .join("");
}

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
}

const isDelimiter = (row: string): boolean => cells(row).every((c) => /^\s*:?-{3,}:?\s*$/.test(c));

function table(rows: string[]): string {
  const [head, ...rest] = rows;
  const body = rest.filter((r) => !isDelimiter(r));
  const th = cells(head ?? "")
    .map((c) => `<th scope="col">${inline(c.trim())}</th>`)
    .join("");
  const trs = body.map(
    (r) =>
      `<tr>${cells(r)
        .map((c) => `<td>${inline(c.trim())}</td>`)
        .join("")}</tr>`,
  );
  return `<table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${trs.join("\n")}\n</tbody>\n</table>`;
}

/** The disclosure's Markdown as the page's main content. */
export function renderBody(markdown: string): string {
  const out: string[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      out.push(`<h${level}>${inline((heading[2] ?? "").trim())}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("|")) rows.push(lines[i++] ?? "");
      out.push(table(rows));
      continue;
    }
    if (/^\s*- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*- /.test(lines[i] ?? "")) items.push((lines[i++] ?? "").replace(/^\s*- /, ""));
      out.push(`<ul>\n${items.map((item) => `<li>${inline(item)}</li>`).join("\n")}\n</ul>`);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (next.trim() === "" || /^#{1,6}\s/.test(next) || next.trimStart().startsWith("|") || /^\s*- /.test(next))
        break;
      paragraph.push(next.trim());
      i += 1;
    }
    out.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return out.join("\n");
}

/** The whole page: the site's AI disclosure and a way back, then the rendered Markdown. */
export function renderDisclosure(markdown: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data-flow disclosure</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header>
<p>${escape(AI_DISCLOSURE)}</p>
<p><a href="../">Back to the room</a></p>
</header>
<main>
${renderBody(markdown)}
</main>
</body>
</html>
`;
}

/** The Vite plugin: emits disclosure/index.html and its stylesheet from the Markdown, read when the bundle is written. */
export function disclosurePage(options: { source: string }): Plugin {
  return {
    name: "h4-disclosure-page",
    apply: "build",
    generateBundle() {
      this.addWatchFile(options.source);
      const markdown = readFileSync(options.source, "utf8");
      this.emitFile({ type: "asset", fileName: "disclosure/index.html", source: renderDisclosure(markdown) });
      this.emitFile({ type: "asset", fileName: "disclosure/style.css", source: STYLE });
    },
  };
}
