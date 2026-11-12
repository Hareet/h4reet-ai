// T136 (spec 001; FR-057 to FR-059, SC-013; contracts/public-view.md §3): /status/, the public view. It renders the
// document the sink writes, site/status/latest.json, each part with when it was taken, and takes which host serves
// from the relay's live /api/status first: it names `none` whenever that answer is the edge's degraded one (503,
// no_host_serving, stack null) or there is none, as while the tunnel end and the sink are gone, whatever the document
// last said, and then shows the document's values as last-known. It shows the handovers and their gaps, the server's
// month beside its budget, and model spend beside the ceilings. The release build holds the page, with no inline
// script, no form, and no request to another host.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

import { degradedBody } from "../build/degraded";
import { HOSTS, type Host, renderStatus, servingHost, type StatusAnswer } from "../status/view";

// Spec 001's hosts, from the page's own module: `laptop` is also a room piece's ID, which spec 004's source scan
// (FR-007) keeps out of this folder's literals, so the test takes the names as the page does.
const [LAPTOP, EC2, NONE] = HOSTS;

const NOW = Date.UTC(2027, 0, 15, 8, 2, 0);
const at = (minutesAgo: number): string => new Date(NOW - minutesAgo * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

function doc(host: Host = LAPTOP): Record<string, unknown> {
  return {
    schema: 1,
    written_at: at(1),
    serving: { host, since: at(30), ec2_state: "stopped", taken_at: at(1) },
    spend: {
      kill_switch: "normal",
      today_usd: 1.23,
      month_usd: 7.65,
      fallback_remaining_usd: 1.9,
      fallback_awaiting_renewal: false,
      adapter_months: [{ adapter: "anthropic", month: "2027-01", spent_usd: 3.21 }],
      taken_at: at(1),
    },
    server: { month_to_date_usd: 12.34, budget_usd: 45, as_of: at(40) },
    handovers: {
      events: [
        { at: at(2), from: NONE, to: LAPTOP, gap_s: 95 },
        { at: at(4), from: "ec2", to: "none", gap_s: null },
      ],
      taken_at: at(1),
    },
    host_panels: {
      host: LAPTOP,
      taken_at: at(3),
      requests_per_s: 0.25,
      error_rate: 0.01,
      latency_p50_s: 0.4,
      latency_p95_s: 1.4,
      model_server_up: true,
      degraded_causes: [],
      ceilings: { day_usd: 5, month_usd: 20 },
      warnings: { day_usd: 3.5, month_usd: 14 },
      release: "0123456789ab",
    },
    releases: {
      [LAPTOP]: { release: "0123456789ab", taken_at: at(3) },
      ec2: { release: "ba9876543210", taken_at: at(600) },
    },
  };
}

const serving = (host: string): StatusAnswer => ({
  httpStatus: 200,
  body: {
    serving: host,
    since: at(30),
    ec2: "stopped",
    kill_switch: "normal",
    hello_would_get: "answer",
    taken_at: at(0),
    local_tier: host === LAPTOP ? "up" : "down",
    state: "normal",
    cause_now: null,
  },
});
const EDGE_DEGRADED: StatusAnswer = { httpStatus: 503, body: degradedBody() };

function page(document: unknown, answer: StatusAnswer | null): HTMLElement {
  const { window } = new JSDOM("<!doctype html><main id='status'></main>");
  const root = window.document.getElementById("status") as HTMLElement;
  renderStatus(root, document, answer, NOW);
  return root;
}
const text = (root: HTMLElement): string => (root.textContent ?? "").replace(/\s+/g, " ");
const part = (root: HTMLElement, name: string): HTMLElement => {
  const el = root.querySelector(`[data-part="${name}"]`);
  expect(el, name).not.toBeNull();
  return el as HTMLElement;
};

describe("which host serves comes from /api/status first (contract §3; FR-057)", () => {
  it("is the relay's answer while it gives one", () => {
    expect(servingHost(serving(LAPTOP))).toBe(LAPTOP);
    expect(servingHost(serving(EC2))).toBe(EC2);
    expect(servingHost(serving(NONE))).toBe(NONE);
  });

  it("is none on the edge's degraded answer or none at all", () => {
    expect(servingHost(EDGE_DEGRADED)).toBe(NONE);
    expect(servingHost(null)).toBe(NONE);
    expect(servingHost({ httpStatus: 502, body: null })).toBe(NONE);
    expect(servingHost({ httpStatus: 200, body: { serving: "the Author's machine" } })).toBe(NONE);
  });

  it("names none when latest.json names a host but /api/status gives the edge's degraded answer", () => {
    const root = page(doc(LAPTOP), EDGE_DEGRADED);
    expect(part(root, "serving").dataset.host).toBe(NONE);
    expect(text(part(root, "serving"))).toMatch(/No host is serving/);
    expect(text(root)).not.toMatch(new RegExp(`The ${LAPTOP} is serving|EC2 is serving`));
  });

  it("names none when /api/status gives no answer, as while the tunnel end is gone", () => {
    const root = page(doc(EC2), null);
    expect(part(root, "serving").dataset.host).toBe(NONE);
    expect(text(part(root, "serving"))).toMatch(/No host is serving/);
  });

  it("then shows the document's values as last-known, with their times", () => {
    const root = page(doc(LAPTOP), EDGE_DEGRADED);
    for (const name of ["host_panels", "spend", "server", "handovers"]) {
      expect(text(part(root, name)), name).toMatch(/last-known/i);
      expect(text(part(root, name)), name).toMatch(/taken at \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/i);
    }
  });

  it("names the host and shows no last-known mark while the relay serves and the values are fresh", () => {
    const root = page(doc(LAPTOP), serving(LAPTOP));
    expect(part(root, "serving").dataset.host).toBe(LAPTOP);
    expect(text(part(root, "serving"))).toMatch(new RegExp(`The ${LAPTOP} is serving`));
    expect(text(root)).not.toMatch(/last-known/i);
  });
});

describe("each part, with its time (FR-058, FR-059; SC-013)", () => {
  it("renders every part with when it was taken and how long ago", () => {
    const root = page(doc(LAPTOP), serving(LAPTOP));
    for (const name of ["serving", "host_panels", "spend", "server", "handovers"]) {
      expect(text(part(root, name)), name).toMatch(/taken at \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC \(\d+ minutes? ago\)/i);
    }
  });

  it("says in words when values are older than 5 minutes, not by colour alone", () => {
    const old = doc(LAPTOP);
    (old.host_panels as Record<string, unknown>).taken_at = at(9);
    const root = page(old, serving(LAPTOP));
    expect(text(part(root, "host_panels"))).toMatch(/older than 5 minutes/i);
  });

  it("names none while no host serves, by the document and the relay alike", () => {
    const root = page(doc(NONE), serving(NONE));
    expect(part(root, "serving").dataset.host).toBe(NONE);
    expect(text(part(root, "serving"))).toMatch(/No host is serving/);
  });

  it("shows FR-028's panels from the host part", () => {
    const t = text(part(page(doc(LAPTOP), serving(LAPTOP)), "host_panels"));
    for (const words of [
      "Requests",
      "0.25",
      "Error rate",
      "1.0%",
      "p50",
      "0.40 s",
      "p95",
      "1.40 s",
      "Model server",
      "up",
    ])
      expect(t).toContain(words);
    expect(t).toMatch(/Why responses are degraded: none/);
  });

  it("shows the handovers and their gaps", () => {
    const rows = [...part(page(doc(LAPTOP), serving(LAPTOP)), "handovers").querySelectorAll("tbody tr")].map((r) =>
      (r.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(new RegExp(`none → ${LAPTOP}`));
    expect(rows[0]).toMatch(/1 min 35 s/);
    expect(rows[1]).toMatch(/ec2 → none/);
    expect(rows[1]).toMatch(/—/);
  });

  it("shows the server's month beside its budget, and model spend beside the ceilings", () => {
    const root = page(doc(LAPTOP), serving(LAPTOP));
    expect(text(part(root, "server"))).toMatch(/\$12\.34 of \$45\.00/);
    const spend = text(part(root, "spend"));
    expect(spend).toMatch(/\$1\.23 of \$5\.00 today/);
    expect(spend).toMatch(/\$7\.65 of \$20\.00 this month/);
    expect(spend).toMatch(/anthropic.*\$3\.21/);
    expect(spend).toMatch(/Kill switch: normal/);
    expect(spend).toMatch(/Fallback remaining: \$1\.90/);
  });

  it("shows EC2's state and the release on each host", () => {
    const root = page(doc(LAPTOP), serving(LAPTOP));
    expect(text(part(root, "serving"))).toMatch(/EC2: stopped/);
    const releases = text(part(root, "releases"));
    expect(releases).toMatch(new RegExp(`${LAPTOP}.*0123456789ab`));
    expect(releases).toMatch(/ec2.*ba9876543210/);
  });

  it("says there is no snapshot yet, and still who serves, when latest.json can't be read", () => {
    const root = page(null, serving(EC2));
    expect(part(root, "serving").dataset.host).toBe(EC2);
    expect(text(root)).toMatch(/No snapshot yet/);
  });

  it("writes every value as text, so nothing in the document becomes markup", () => {
    const evil = doc(LAPTOP);
    (evil.host_panels as Record<string, unknown>).release = "<img src=x onerror=alert(1)>";
    const root = page(evil, serving(LAPTOP));
    expect(root.querySelector("img")).toBeNull();
  });
});

describe("the page as the release build holds it", () => {
  const out = inject("siteBuilds").release;
  const html = readFileSync(join(out, "status", "index.html"), "utf8");
  const dom = new JSDOM(html).window.document;

  it("is /status/index.html, with one module script by its own file and no inline script", () => {
    const scripts = [...dom.querySelectorAll("script")];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute("type")).toBe("module");
    expect(scripts[0]?.getAttribute("src")).toMatch(/^\.\.\/assets\/status-[\w-]+\.js$/);
    expect(dom.querySelectorAll("style, script:not([src])")).toHaveLength(0);
  });

  it("has no write action and nothing per client: no form, no input, no cookie, no storage", () => {
    expect(dom.querySelectorAll("form, input, textarea, button[type=submit]")).toHaveLength(0);
    const src = scriptOf(dom, out);
    expect(src).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/);
  });

  it("asks its own origin alone: the document beside it and the relay's status", () => {
    const src = scriptOf(dom, out);
    expect(src).toContain("latest.json");
    expect(src).toContain("api/status");
    expect(src).not.toMatch(/https?:\/\//);
  });

  it("is listed nowhere else: the room's page doesn't load its script", () => {
    const room = readFileSync(join(out, "index.html"), "utf8");
    const file = (scriptsrc(dom) ?? "").replace(/^\.\.\//, "");
    expect(room).not.toContain(file);
    expect(readdirSync(join(out, "status")).sort()).toEqual(["index.html", "style.css"]);
  });
});

function scriptsrc(dom: Document): string | null {
  return dom.querySelector("script[src]")?.getAttribute("src") ?? null;
}

function scriptOf(dom: Document, out: string): string {
  const src = scriptsrc(dom);
  expect(src).not.toBeNull();
  return readFileSync(join(out, "status", src as string), "utf8");
}
