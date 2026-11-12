// T100 (spec 001; FR-038, FR-041, FR-066; SC-010; contracts/edge.md §3 and §4): the site as the edge serves it, read
// from the global setup's release build. (tasks.md names this test apps/web/test_site.py; the site's tests are this
// workspace's vitest, which make test runs, so it lives here: plan.md §16, "Group 8, as built".)
//   - no page, stylesheet, or script asks another host for anything: no attribute or url() with an absolute URL to
//     another host, and in the scripts no absolute URL but the XML namespaces and the one reference Three.js's shader
//     source quotes, which no browser fetches; the disclosure page names hosts only as its text;
//   - the disclosure page matches the Markdown, with spec 001 group 8's rows;
//   - /_degraded/api.json is spec 000's degraded body, cause no_host_serving and stack null, as edge's own
//     api_unavailable body is, with every field spec 000's §2.5.2 names.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

import { DEGRADED_PATH, degradedBody } from "../build/degraded";
import { renderDisclosure } from "../build/disclosure";

const WEB = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const REPO = resolve(WEB, "../..");
const out = inject("siteBuilds").release;
const SITE_HOST = "hareet.ai";
/** Absolute URLs in the scripts that no browser requests, each with its reason. */
const NOT_REQUESTED: Readonly<Record<string, string>> = {
  "www.w3.org": "XML namespaces, for createElementNS",
  "jcgt.org": "a paper Three.js's shader source cites in a comment",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const ABSOLUTE = /\bhttps?:\/\/([a-z0-9.-]+)/gi;
const hosts = (text: string): string[] => [...text.matchAll(ABSOLUTE)].map((m) => (m[1] ?? "").toLowerCase());

describe("the site asks no other host for anything (SC-010, FR-041)", () => {
  const all = files(out);

  it("holds pages, styles, and scripts to scan", () => {
    expect(all.some((f) => f.endsWith(".html"))).toBe(true);
    expect(all.some((f) => f.endsWith(".js"))).toBe(true);
  });

  it("has no attribute pointing at another host on any page", () => {
    for (const file of all.filter((f) => f.endsWith(".html"))) {
      const doc = new JSDOM(readFileSync(file, "utf8")).window.document;
      for (const el of doc.querySelectorAll("*")) {
        for (const attr of el.getAttributeNames()) {
          for (const host of hosts(el.getAttribute(attr) ?? "")) {
            expect(host, `${relative(out, file)}: <${el.tagName.toLowerCase()} ${attr}>`).toBe(SITE_HOST);
          }
        }
      }
      // Inline styles and scripts are refused by the CSP; none is written either.
      for (const el of doc.querySelectorAll("style, script:not([src])")) {
        expect(hosts(el.textContent ?? ""), relative(out, file)).toEqual([]);
      }
    }
  });

  it("has no url() to another host in any stylesheet", () => {
    for (const file of all.filter((f) => f.endsWith(".css"))) {
      expect(hosts(readFileSync(file, "utf8")), relative(out, file)).toEqual([]);
    }
  });

  it("has no absolute URL in any script but those no browser requests", () => {
    for (const file of all.filter((f) => f.endsWith(".js"))) {
      for (const host of hosts(readFileSync(file, "utf8"))) {
        expect(Object.keys(NOT_REQUESTED), `${relative(out, file)}: ${host}`).toContain(host);
      }
    }
  });

  it("names other hosts on the disclosure page as text alone, never as a link", () => {
    const doc = new JSDOM(readFileSync(join(out, "disclosure", "index.html"), "utf8")).window.document;
    for (const a of doc.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") ?? "";
      expect(/^https?:/i.test(href) ? hosts(href) : [], href).toEqual(hosts(href).filter((h) => h === SITE_HOST));
    }
  });
});

describe("the disclosure page holds spec 001 group 8's rows", () => {
  const source = readFileSync(join(REPO, "docs", "data-flow-disclosure.md"), "utf8");
  const page = readFileSync(join(out, "disclosure", "index.html"), "utf8");

  it("is the Markdown, rendered", () => {
    expect(page).toBe(renderDisclosure(source));
  });

  it.each(["S15", "S20", "V6", "V7", "V8", "V9", "C1", "C14"])("has row %s, in the page as in the Markdown", (id) => {
    expect(source).toMatch(new RegExp(`^\\| ${id} \\|`, "m"));
    const doc = new JSDOM(page).window.document;
    const cells = [...doc.querySelectorAll("tr td:first-child")].map((td) => td.textContent?.trim());
    expect(cells).toContain(id);
  });
});

/** spec 000's §2.5.2 table, read from its contract: the degraded body's fields, in the order it lists them. */
function degradedFields(): string[] {
  const text = readFileSync(join(REPO, "specs/000-local-foundations/contracts/gateway-http.md"), "utf8");
  const start = text.indexOf("#### 2.5.2 503: degraded");
  const end = text.indexOf("#### 2.5.3", start);
  const fields: string[] = [];
  for (const line of text.slice(start, end).split("\n")) {
    const m = /^\| ((?:`[a-z_]+`(?:, )?)+) \|/.exec(line);
    if (m) for (const f of (m[1] ?? "").matchAll(/`([a-z_]+)`/g)) fields.push(f[1] ?? "");
  }
  return fields;
}

describe("/_degraded/api.json, the edge's own degraded answer (FR-034, FR-066; contracts/edge.md §4)", () => {
  it("is in the release build at its path", () => {
    expect(DEGRADED_PATH).toBe("_degraded/api.json");
    const body = JSON.parse(readFileSync(join(out, DEGRADED_PATH), "utf8")) as Record<string, unknown>;
    expect(body).toEqual(degradedBody());
  });

  it("has exactly spec 000's fields, cause no_host_serving, stack, since, ceilings, and trace null", () => {
    const body = degradedBody() as Record<string, unknown>;
    const fields = degradedFields();
    expect(fields).toContain("request_id");
    expect(Object.keys(body).sort()).toEqual([...new Set(fields)].sort());
    expect(body).toMatchObject({
      state: "degraded",
      cause: "no_host_serving",
      ceilings: null,
      stack: null,
      since: null,
      trace_id: null,
    });
    // A file has no request to name; edge's own body names nginx's, and this one none.
    expect(body.request_id).toBeNull();
    expect(typeof body.detail).toBe("string");
    expect(String(body.detail)).not.toMatch(/https?:|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  });
});
