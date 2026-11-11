// The credits page (spec 016, FR-042, FR-043; plan.md R-14; spec 003, FR-033): assets/CREDITS.md, which
// scripts/assets/credits.py renders from each asset directory's records.json, rendered into dist/credits/index.html at
// build, as build/disclosure.ts renders the data-flow disclosure, so the page the room links is the file the arrival
// check holds to the records. Its first part is a contents list of the file's `##` sections, one an asset directory,
// each linking to its section's anchor, so a visitor reaches a directory's records, the twin's among them, in two
// activations from the room: "Credits", then the directory. The file is read through the build and never changed; every
// character of it is escaped by disclosure.ts's renderer, so the page holds no markup but what these files write.
import { readFileSync } from "node:fs";

import type { Plugin } from "vite";

import { renderBody } from "./disclosure";

const AI_DISCLOSURE = "You're talking with an AI representation of the Author, not the Author.";

const STYLE = `body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 0 auto; max-width: 90rem; padding: 1rem; }
header { border-bottom: 1px solid #555; margin-bottom: 1rem; }
nav ul { padding-left: 1.25rem; }
code { font-family: ui-monospace, monospace; font-size: 0.95em; }
a { color: #0b4f9c; }
a:focus-visible { outline: 2px solid #0b4f9c; outline-offset: 2px; }
`;

const escape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** A section's anchor: its heading's words, lowercased, each run of other characters one hyphen (`assets/twin` →
 *  `assets-twin`). */
export function anchorOf(heading: string): string {
  return heading
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The `##` headings of the Markdown, each an asset directory, in order. */
export function directories(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => {
      const m = /^##\s+(.*)$/.exec(line);
      return m ? [(m[1] ?? "").trim()] : [];
    });
}

/** The whole page: the site's AI disclosure and a way back, the contents, then the rendered Markdown, each `##`
 *  heading carrying its anchor. */
export function renderCredits(markdown: string): string {
  const dirs = directories(markdown);
  const contents = dirs.map((d) => `<li><a href="#${anchorOf(d)}">${escape(d.replace(/`/g, ""))}</a></li>`).join("\n");
  const body = renderBody(markdown).replace(/<h2>(.*?)<\/h2>/g, (_whole, inner: string) => {
    const text = inner
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    return `<h2 id="${anchorOf(text)}">${inner}</h2>`;
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Credits</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header>
<p>${escape(AI_DISCLOSURE)}</p>
<p><a href="../">Back to the room</a></p>
</header>
<main>
<nav aria-label="Asset directories">
<ul>
${contents}
</ul>
</nav>
${body}
</main>
</body>
</html>
`;
}

/** The Vite plugin: emits credits/index.html and its stylesheet from assets/CREDITS.md, read when the bundle is
 *  written. */
export function creditsPage(options: { source: string }): Plugin {
  return {
    name: "h4-credits-page",
    apply: "build",
    generateBundle() {
      this.addWatchFile(options.source);
      const markdown = readFileSync(options.source, "utf8");
      this.emitFile({ type: "asset", fileName: "credits/index.html", source: renderCredits(markdown) });
      this.emitFile({ type: "asset", fileName: "credits/style.css", source: STYLE });
    },
  };
}
