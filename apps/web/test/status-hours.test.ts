// T170 (spec 001; the Author's answer to W1's question 1b, "W1 answers: 1a A, 1b A, …", 2026-11-12, and to where the
// hours show, "Only /status/ (Recommended)"): /status/ shows EC2's hours in their zone, as the document's `ec2_hours`
// carries them, which the sink reads from the two schedules (`scheduler:GetSchedule` on h4-ec2-hours-open and
// h4-ec2-hours-close), so `local.ec2_hours` stays their one source. The relay's status answer doesn't carry them (a
// named deviation from 1b's wording, plan.md §16). Without them (a failed read), the page says the hours are unknown
// rather than guess. FR-038 holds: the hours are the system's, not a fact about the Author.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { HOSTS, renderStatus, type StatusAnswer } from "../status/view";

// The hosts' names from the page's own module, as status.test.ts takes them: spec 004's source scan (FR-007) keeps
// `laptop`, a room piece's ID, out of this folder's literals.
const [LAPTOP, EC2] = HOSTS;
const NOW = Date.UTC(2027, 0, 15, 8, 2, 0);
const at = (minutesAgo: number): string => new Date(NOW - minutesAgo * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

function doc(hours: unknown): Record<string, unknown> {
  return {
    schema: 1,
    written_at: at(1),
    serving: { host: EC2, since: at(30), ec2_state: "running", taken_at: at(1) },
    spend: null,
    server: null,
    handovers: null,
    host_panels: null,
    releases: { [LAPTOP]: null, ec2: null },
    ec2_hours: hours,
  };
}

const answer: StatusAnswer = {
  httpStatus: 200,
  body: {
    serving: EC2,
    since: at(30),
    ec2: "running",
    kill_switch: "normal",
    hello_would_get: "answer",
    taken_at: at(0),
    local_tier: "down",
    state: "normal",
    cause_now: null,
  },
};

function page(document: unknown): HTMLElement {
  const { window } = new JSDOM("<!doctype html><main id='status'></main>");
  const root = window.document.getElementById("status") as HTMLElement;
  renderStatus(root, document, answer, NOW);
  return root;
}
const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ");

describe("EC2's hours on /status/ (T170; question 1b, option A, /status/ only)", () => {
  it("shows the hours in their zone, from the document", () => {
    const root = page(doc({ open: "07:00", close: "19:00", zone: "America/Denver" }));
    const hours = root.querySelector('[data-part="ec2_hours"]');
    expect(hours).not.toBeNull();
    expect(text(hours)).toMatch(/07:00 to 19:00/);
    expect(text(hours)).toMatch(/America\/Denver/);
  });

  it("says the hours are unknown when the document has none", () => {
    const root = page(doc(null));
    expect(text(root.querySelector('[data-part="ec2_hours"]'))).toMatch(/EC2's hours are unknown/);
  });

  it("writes the hours as text, never markup", () => {
    const root = page(doc({ open: "07:00", close: "19:00", zone: "<img src=x>" }));
    expect(root.querySelector("img")).toBeNull();
  });
});
