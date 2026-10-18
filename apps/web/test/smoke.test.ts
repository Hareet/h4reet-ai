// T004 (spec 002): the built site, as the web image serves it. One vite build into a temporary directory, then:
// every script and stylesheet comes from a relative path on the site's own origin (FR-057, the CSP's 'self'), no
// inline script or style the CSP would refuse, the AI disclosure and the PDF link on the first screen (FR-004,
// FR-018), the data-flow disclosure page beside it (FR-058), and 0 axe violations on both pages.
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import axe from "axe-core";
import { JSDOM } from "jsdom";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { renderDisclosure } from "../build/disclosure";

const WEB = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DISCLOSURE_MD = resolve(WEB, "../../docs/data-flow-disclosure.md");
const AI_DISCLOSURE = "You're talking with an AI representation of the Author, not the Author.";

let out = "";
let policy = "";

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "h4-web-build-"));
  // An empty policy directory and no drafts: the build a checkout with nothing approved on main makes.
  policy = mkdtempSync(join(tmpdir(), "h4-web-policy-"));
  vi.stubEnv("ROOM_POLICY_DIR", policy);
  vi.stubEnv("ROOM_DRAFTS", "");
  await build({
    root: WEB,
    configFile: join(WEB, "vite.config.ts"),
    logLevel: "silent",
    build: { outDir: out, emptyOutDir: true },
  });
}, 120_000);

afterAll(() => {
  vi.unstubAllEnvs();
  for (const dir of [out, policy]) if (dir) rmSync(dir, { recursive: true, force: true });
});

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
    const data = JSON.parse(readFileSync(join(out, "room-data.json"), "utf8")) as unknown;
    const absent = createHash("sha256")
      .update("content-approvals.json:absent\nresume-header.json:absent\n")
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
    expect(data).toEqual({
      built_from: { policy: absent, lock },
      published: [],
      drafts: ["apps/web/content/resume.yaml", ...scripts],
      resume_state: "withheld",
      header: null,
      sections: [],
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
