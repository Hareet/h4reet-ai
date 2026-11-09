// T004 (spec 002): the built site, as the web image serves it. The release build the global setup makes before any
// test file runs (test/global-build.ts; spec 004, T084), then: every script and stylesheet comes from a relative path
// on the site's own origin (FR-057, the CSP's 'self'), no inline script or style the CSP would refuse, the AI
// disclosure and the PDF link on the first screen (FR-004, FR-018), the data-flow disclosure page beside it (FR-058),
// and 0 axe violations on both pages.
// T093 (spec 004; FR-075; R-67): in the release build and the drafts build alike, every typeface, data file, and
// model the site loads is on its own origin: each stylesheet's url() and each such path a script names is relative, to
// a file in the build, and the room's models, compose()'s as the build composed them, are relative `a/` paths whose
// gzip copies are what `a/` holds.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import axe from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

import { renderDisclosure } from "../build/disclosure";
import { repositoryBundle } from "./helpers/room";

const WEB = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DISCLOSURE_MD = resolve(WEB, "../../docs/data-flow-disclosure.md");
const AI_DISCLOSURE = "You're talking with an AI representation of the Author, not the Author.";

// An empty policy directory and no drafts: the build a checkout with nothing approved on main makes.
const out = inject("siteBuilds").release;

function page(rel: string): JSDOM {
  return new JSDOM(readFileSync(join(out, rel), "utf8"), { runScripts: "outside-only" });
}

/** Every URL the page loads by itself: script and stylesheet sources, icons, images, preloads. */
function loaded(doc: Document): string[] {
  const urls: string[] = [];
  doc.querySelectorAll("script[src]").forEach((e) => urls.push(e.getAttribute("src") ?? ""));
  doc.querySelectorAll("link[href]").forEach((e) => urls.push(e.getAttribute("href") ?? ""));
  doc.querySelectorAll("img[src], source[src], iframe[src]").forEach((e) => urls.push(e.getAttribute("src") ?? ""));
  return urls;
}

const isRelative = (url: string): boolean =>
  url !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("/") && !url.startsWith("\\");

async function axeViolations(dom: JSDOM): Promise<string[]> {
  const win = dom.window as unknown as Window & { eval(code: string): unknown; axe: typeof axe };
  win.eval(axe.source);
  const result = await win.axe.run(win.document, { resultTypes: ["violations"] });
  return result.violations.map((v) => `${v.id}: ${v.help}`);
}

describe("the built index.html", () => {
  it("loads its scripts and styles from relative paths on its own origin only", () => {
    const doc = page("index.html").window.document;
    // No inline script: the CSP's script-src 'self' would refuse it. (Phase 1's entry holds only the stylesheet, so
    // Vite emits no script chunk yet; the choice screen's script, T040, arrives under the same rule.)
    for (const s of doc.querySelectorAll("script")) expect(s.getAttribute("src"), s.outerHTML).toBeTruthy();
    const urls = loaded(doc);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(isRelative(url), url).toBe(true);
    // Nothing the CSP's style-src 'self' would refuse.
    expect(doc.querySelectorAll("style, [style]")).toHaveLength(0);
    // Each one is in the build.
    for (const url of urls) expect(existsSync(join(out, url)), url).toBe(true);
  });

  it("shows the AI disclosure, the PDF link, and the data-flow disclosure link", () => {
    const doc = page("index.html").window.document;
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
    expect(doc.body.textContent?.replace(/\s+/g, " ")).toContain(AI_DISCLOSURE);
    const links = [...doc.querySelectorAll("a")].map((a) => [a.textContent?.trim(), a.getAttribute("href")]);
    expect(links).toContainEqual(["Download the resume (PDF)", "./resume.pdf"]);
    expect(links).toContainEqual(["How data flows", "./disclosure/"]);
    for (const [, href] of links) expect(isRelative(href ?? ""), href ?? "").toBe(true);
  });

  it("has no axe violations", async () => {
    expect(await axeViolations(page("index.html"))).toEqual([]);
  });
});

describe("the built disclosure page", () => {
  it("is the rendering of docs/data-flow-disclosure.md, with its stylesheet", () => {
    expect(readFileSync(join(out, "disclosure/index.html"), "utf8")).toBe(
      renderDisclosure(readFileSync(DISCLOSURE_MD, "utf8")),
    );
    expect(existsSync(join(out, "disclosure/style.css"))).toBe(true);
  });

  it("loads nothing but its own stylesheet, and runs no script", () => {
    const doc = page("disclosure/index.html").window.document;
    expect(doc.querySelectorAll("script, style, [style]")).toHaveLength(0);
    expect(loaded(doc)).toEqual(["style.css"]);
  });

  it("has no axe violations", async () => {
    expect(await axeViolations(page("disclosure/index.html"))).toEqual([]);
  });
});

describe("the built room-data.json", () => {
  it("names the policy and the lock it was built with, and lists the drafts it left out", () => {
    // Nothing is approved in an empty policy directory, so the resume's source is a draft, withheld without drafts.
    // The policy's digest covers its three files, caps.json third, each absent here (spec 004, T004; R-13).
    const data = JSON.parse(readFileSync(join(out, "room-data.json"), "utf8")) as unknown;
    const absent = createHash("sha256")
      .update("content-approvals.json:absent\nresume-header.json:absent\ncaps.json:absent\n")
      .digest("hex");
    const lock = createHash("sha256")
      .update(readFileSync(join(WEB, "content/resume.lock.json")))
      .digest("hex");
    // The resume's source, then every narration script, all drafts (contracts/narration.md §3).
    const scripts = existsSync(join(WEB, "content/narration"))
      ? readdirSync(join(WEB, "content/narration"))
          .filter((n) => n.endsWith(".md"))
          .sort()
          .map((n) => `apps/web/content/narration/${n}`)
      : [];
    // Then the room's text, its blocks and then its outlines, each in name order, every one a draft here, and room_text
    // with no block (spec 004, T186; contracts/room-bundle.md §5).
    const room = (dir: string, suffix: string): string[] =>
      existsSync(join(WEB, dir))
        ? readdirSync(join(WEB, dir))
            .filter((n) => n.endsWith(suffix))
            .sort()
            .map((n) => `apps/web/${dir}/${n}`)
        : [];
    const roomText = [...room("content/room", ".yaml"), ...room("content/room/outlines", ".outline.json")];
    expect(data).toEqual({
      built_from: { policy: absent, lock },
      published: [],
      drafts: ["apps/web/content/resume.yaml", ...scripts, ...roomText],
      resume_state: "withheld",
      header: null,
      sections: [],
      room_text: { blocks: [] },
    });
  });
});

describe("the built resume.pdf (FR-018)", () => {
  it("is in the build, where the first screen's link points, and is a PDF", () => {
    const pdf = readFileSync(join(out, "resume.pdf"));
    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.7");
  });

  it("has its text beside it, which says only that the withheld draft is a draft", () => {
    expect(readFileSync(join(out, "resume.pdf.txt"), "utf8")).toBe("Draft, not approved\n");
  });

  it("carries none of a withheld draft's words, the resume's or a script's, and neither does any other built file", () => {
    // The start of every item's display text, as the source writes it, before any slot reference.
    const source = readFileSync(join(WEB, "content/resume.yaml"), "utf8");
    const texts = [...source.matchAll(/^\s+(?:- )?text: "?(.+?)"?$/gm)]
      .map((m) => (m[1] as string).replace(/\{\{slot:[^}]*\}\}.*/, "").slice(0, 40))
      .filter((t) => t.length >= 20);
    expect(texts.length).toBeGreaterThan(0);
    // And every narration script's words: each sentence's first 40 characters, cut at any slot reference.
    const narration = join(WEB, "content/narration");
    for (const name of existsSync(narration) ? readdirSync(narration) : []) {
      const body = readFileSync(join(narration, name), "utf8").split("\n---\n").slice(1).join("\n---\n");
      for (const sentence of body.replace(/\{\{slot:[^}]*\}\}/g, "\n").split(/(?<=[.!?])\s+|\n/)) {
        const start = sentence.trim().slice(0, 40);
        if (start.length >= 24) texts.push(start);
      }
    }
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(out);
    for (const file of files) {
      const body = readFileSync(file, "utf8");
      for (const text of texts) expect(body.includes(text), `${file} holds "${text}"`).toBe(false);
    }
  });
});

describe("the built scripts (T060)", () => {
  it("send the usage events' beacon to the site's own /api/room/events, so the page's entry wires it in", () => {
    const scripts: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".js")) scripts.push(readFileSync(path, "utf8"));
      }
    };
    walk(out);
    const beacon = scripts.filter((s) => s.includes("/api/room/events"));
    expect(beacon).toHaveLength(1);
    expect(beacon[0]).toContain("sendBeacon");
  });
});

/** Every file under a folder, by its path from that folder, `/`-separated. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relative(dir, path).split("\\").join("/"));
    }
  };
  walk(dir);
  return found.sort();
}

/** A path a script names for a typeface, a data file, a model, or an image: a whole string literal, quoted any way. */
const RESOURCE = /["'`]([^"'`\s]*\.(?:json|glb|gz|woff2?|ttf|otf|png|jpe?g|webp))["'`]/g;

describe.each(["release", "drafts"] as const)("what the %s build loads (spec 004, T093; FR-075)", (kind) => {
  const root = inject("siteBuilds")[kind];
  const files = filesUnder(root);

  it("takes every typeface from its own origin: each stylesheet's url() is a relative path to a file in the build", () => {
    const sheets = files.filter((f) => f.endsWith(".css"));
    expect(sheets.length).toBeGreaterThan(0);
    const urls: string[] = [];
    for (const sheet of sheets) {
      const css = readFileSync(join(root, sheet), "utf8");
      for (const m of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
        const url = m[1] ?? "";
        urls.push(url);
        expect(isRelative(url) && !url.startsWith("//"), `${sheet}: ${url}`).toBe(true);
        expect(existsSync(join(root, dirname(sheet), url)), `${sheet}: ${url}`).toBe(true);
      }
    }
    // The room's typefaces are among them: IBM Plex, and the chalkboard's hand.
    expect(urls.filter((u) => u.endsWith(".woff")).length).toBeGreaterThanOrEqual(4);
  });

  it("takes every data file, model, and typeface a script names from its own origin, a relative path in the build", () => {
    const named: string[] = [];
    for (const script of files.filter((f) => f.endsWith(".js"))) {
      for (const m of readFileSync(join(root, script), "utf8").matchAll(RESOURCE)) {
        const url = m[1] ?? "";
        named.push(url);
        expect(isRelative(url) && !url.startsWith("//"), `${script}: ${url}`).toBe(true);
        // From the page's own folder, the site's root; a model is served from its gzip copy (contracts/serving.md).
        const at = join(root, url.endsWith(".glb") ? `${url}.gz` : url);
        expect(existsSync(at), `${script}: ${url}`).toBe(true);
      }
    }
    // room-data.json, which the room fetches for the resume and its narration, is one.
    expect(named.some((u) => u.endsWith("room-data.json"))).toBe(true);
  });

  it("takes the room's models from its own origin: relative a/ paths, whose gzip copies and cards are all a/ holds", () => {
    const { models, cards } = repositoryBundle({ drafts: kind === "drafts", policy: "empty" });
    const urls = [...models.map((m) => m.url), ...cards.map((c) => c.url)];
    for (const url of urls) expect(url, url).toMatch(/^a\/[^/]+$/);
    expect(filesUnder(join(root, "a"))).toEqual(
      [...models.map((m) => `${m.url}.gz`), ...cards.map((c) => c.url)].map((u) => u.slice(2)).sort(),
    );
  });
});
