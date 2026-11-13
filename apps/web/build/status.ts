// /status/, the public view's page (spec 001 FR-057 to FR-059; contracts/public-view.md §3; tasks.md T138): a static
// page of the site, status/index.html, its stylesheet, and its one module script, which the build makes from
// status/main.ts as an entry of its own, so the room's page never loads it. Its code lives in apps/web/status/, apart
// from the room's code: it is spec 001's page, not the room, and it names spec 001's hosts, `laptop` among them, a word
// spec 004's source scan (FR-007) holds to the room's data, where a piece of the room has the same ID. The script reads latest.json beside
// the page and the relay's /api/status, both on the site's own origin, every 60 s while the page is visible; it has no
// form, no write action, no cookie, and no storage. The edge serves /status/ by the index function (P-I5), and the
// release's site sync keeps status/latest.json, the sink's, apart from the release's files.
import type { Plugin } from "vite";

const STYLE = `body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 0 auto; max-width: 60rem; padding: 1rem; }
header { border-bottom: 1px solid #555; margin-bottom: 1rem; }
section { border-bottom: 1px solid #ccc; padding: 0.5rem 0; }
section[data-host="none"] > p:first-of-type { font-weight: bold; }
.taken { color: #444; font-size: 0.9em; }
table { border-collapse: collapse; }
th, td { padding: 0.25rem 0.75rem 0.25rem 0; text-align: left; }
a { color: #0b4f9c; }
a:focus-visible { outline: 2px solid #0b4f9c; outline-offset: 2px; }
`;

/** The page, its script by the file name the build gave the entry. */
export function renderStatusPage(script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The system, live: the public view</title>
<link rel="stylesheet" href="style.css">
<script type="module" src="${script}"></script>
</head>
<body>
<header>
<p>What the twin's system is doing, read-only, refreshed every minute. Values say when they were taken.</p>
<p><a href="../">Back to the room</a></p>
</header>
<main id="status" aria-live="polite">
<p>Loading the public view…</p>
</main>
</body>
</html>
`;
}

/** The Vite plugin: the script as an entry chunk of its own, then the page and its stylesheet that name it. */
export function statusPage(options: { entry: string }): Plugin {
  let ref = "";
  return {
    name: "h4-status-page",
    apply: "build",
    buildStart() {
      ref = this.emitFile({ type: "chunk", id: options.entry, name: "status" });
    },
    generateBundle() {
      const script = this.getFileName(ref);
      this.emitFile({ type: "asset", fileName: "status/index.html", source: renderStatusPage(`../${script}`) });
      this.emitFile({ type: "asset", fileName: "status/style.css", source: STYLE });
    },
  };
}
