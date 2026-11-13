// /status/, the public view (spec 001 FR-057 to FR-059, SC-013; contracts/public-view.md §3; data-model.md §5): the
// document the tunnel end's sink writes, site/status/latest.json, rendered part by part, each with when it was taken,
// and which host serves from the relay's live /api/status first. While that answer is the edge's degraded one (503,
// no_host_serving, stack null), or there is none, as while the tunnel end and the sink are gone, the page names `none`,
// whatever the document last said, and marks the document's values last-known (FR-057, FR-076). Every value goes in as
// text, never markup. apps/web/test/status.test.ts holds it.

/** Spec 001's hosts, as the relay names them, `none` the third. */
export const HOSTS = ["laptop", "ec2", "none"] as const;
export type Host = (typeof HOSTS)[number];

/** The relay's answer to GET /api/status, or the edge's in its place: its HTTP status and its parsed body. */
export interface StatusAnswer {
  readonly httpStatus: number;
  readonly body: unknown;
}

const FRESH_MS = 5 * 60_000;
const HOST_NAMES: Readonly<Record<Host, string>> = { laptop: "The laptop", ec2: "EC2", none: "No host" };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Which host serves: the relay's own answer while it gives one; `none` on the edge's degraded answer (503,
 *  `no_host_serving`) or no answer at all, as while the tunnel end is gone; `unknown` on anything else, the status
 *  cap's 429 or another 5xx among them (group 10's review). */
export function servingHost(answer: StatusAnswer | null): Host | "unknown" {
  if (answer === null) return "none";
  const body = obj(answer.body);
  if (answer.httpStatus === 503 && body?.cause === "no_host_serving") return "none";
  if (answer.httpStatus !== 200) return "unknown";
  const serving = body?.serving;
  return (HOSTS as readonly unknown[]).includes(serving) ? (serving as Host) : "unknown";
}

/** A time as the page writes it, `2027-01-15 08:00 UTC`, and how long before now. */
function when(taken: string | null, now: number): { text: string; stale: boolean } {
  const ms = taken === null ? Number.NaN : Date.parse(taken);
  if (Number.isNaN(ms)) return { text: "taken at an unknown time", stale: true };
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  const stamp = new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  const ago = minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  return { text: `taken at ${stamp} UTC (${ago})`, stale: now - ms > FRESH_MS };
}

const dollars = (v: unknown): string => {
  const n = num(v);
  return n === null ? "—" : `$${n.toFixed(2)}`;
};

function gap(seconds: unknown): string {
  const s = num(seconds);
  if (s === null) return "—";
  const whole = Math.round(s);
  const m = Math.floor(whole / 60);
  return m > 0 ? `${m} min ${whole % 60} s` : `${whole} s`;
}

/** The page's parts, each a section with its heading, its lines, and its time; then written as text. */
export function renderStatus(root: HTMLElement, document: unknown, answer: StatusAnswer | null, now: number): void {
  const doc = obj(document);
  const host = servingHost(answer);
  const docHost = str(obj(doc?.serving)?.host);
  // Last-known: the relay doesn't name a host, or names another than the document's, as while the sink is gone.
  const lastKnown = host === "none" || host === "unknown" || (docHost !== null && docHost !== host);
  const d = root.ownerDocument;
  root.replaceChildren();

  const section = (name: string, heading: string): HTMLElement => {
    const el = d.createElement("section");
    el.dataset.part = name;
    const h = d.createElement("h2");
    h.textContent = heading;
    el.append(h);
    root.append(el);
    return el;
  };
  const line = (parent: HTMLElement, text: string): HTMLElement => {
    const p = d.createElement("p");
    p.textContent = text;
    parent.append(p);
    return p;
  };
  const taken = (parent: HTMLElement, at: unknown, mark = lastKnown): void => {
    const t = when(str(at), now);
    const words = [`Values ${t.text}`];
    if (t.stale) words.push("older than 5 minutes");
    if (mark) words.push("last-known");
    const p = line(parent, words.join("; ") + ".");
    p.className = "taken";
  };

  const serving = section("serving", "Which host serves");
  serving.dataset.host = host;
  line(
    serving,
    host === "none"
      ? "No host is serving right now."
      : host === "unknown"
        ? "Which host serves is unknown right now."
        : `${HOST_NAMES[host]} is serving.`,
  );
  const sv = obj(doc?.serving);
  if (sv !== null) {
    // The document's value, so last-known whenever the parts are (contract §3).
    line(serving, `EC2: ${str(sv.ec2_state) ?? "unknown"}${lastKnown ? " (last-known)" : ""}.`);
    taken(serving, sv.taken_at, false);
  }
  if (doc === null) {
    line(root, "No snapshot yet: the public view's document can't be read.");
    return;
  }

  // T170 (the Author's answers "1b A" and "Only /status/ (Recommended)"): EC2's hours in their zone, as the sink read
  // them from the two schedules; unknown when the document has none, never a guess.
  const hours = obj(doc.ec2_hours);
  const open = str(hours?.open);
  const close = str(hours?.close);
  const zone = str(hours?.zone);
  const hoursPart = section("ec2_hours", "EC2's hours");
  line(
    hoursPart,
    open !== null && close !== null && zone !== null
      ? `EC2 runs from ${open} to ${close}, ${zone} time; outside them the laptop serves, or no host does.`
      : "EC2's hours are unknown right now.",
  );

  const panels = obj(doc.host_panels);
  const hp = section("host_panels", "Requests, latency, errors, and the model server");
  if (panels === null) line(hp, "No host's values yet.");
  else {
    const rate = num(panels.error_rate);
    const p50 = num(panels.latency_p50_s);
    const p95 = num(panels.latency_p95_s);
    const causes = Array.isArray(panels.degraded_causes) ? panels.degraded_causes.map(String) : [];
    line(hp, `From: ${str(panels.host) ?? "unknown"}.`);
    line(hp, `Requests: ${num(panels.requests_per_s)?.toFixed(2) ?? "—"} a second.`);
    line(hp, `Error rate: ${rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}.`);
    line(
      hp,
      `Latency: p50 ${p50 === null ? "—" : `${p50.toFixed(2)} s`}, p95 ${p95 === null ? "—" : `${p95.toFixed(2)} s`}.`,
    );
    const up = panels.model_server_up;
    line(hp, `Model server: ${up === true ? "up" : up === false ? "down" : "none on this host"}.`);
    // FR-059: the tunnel's state, up while every end the host's panel reads says up (group 10's review, I2).
    const tunnel = panels.tunnel_up;
    line(hp, `Tunnel: ${tunnel === true ? "up" : tunnel === false ? "down" : "unknown"}.`);
    line(hp, `Why responses are degraded: ${causes.length === 0 ? "none" : causes.join(", ")}.`);
    taken(hp, panels.taken_at);
  }

  const spend = obj(doc.spend);
  const ceilings = obj(panels?.ceilings);
  const sp = section("spend", "Model spend, beside the ceilings");
  if (spend === null) line(sp, "The shared state couldn't be read at the last write.");
  else {
    line(sp, `${dollars(spend.today_usd)} of ${dollars(ceilings?.day_usd)} today.`);
    line(sp, `${dollars(spend.month_usd)} of ${dollars(ceilings?.month_usd)} this month.`);
    line(sp, `Kill switch: ${str(spend.kill_switch) ?? "unknown"}.`);
    line(sp, `Fallback remaining: ${dollars(spend.fallback_remaining_usd)}.`);
    const months = Array.isArray(spend.adapter_months) ? spend.adapter_months : [];
    for (const m of months.map(obj)) {
      if (m !== null)
        line(sp, `The ${str(m.adapter) ?? "?"} adapter's month ${str(m.month) ?? "?"}: ${dollars(m.spent_usd)}.`);
    }
    taken(sp, spend.taken_at);
  }

  const server = obj(doc.server);
  const se = section("server", "The server's month, beside its budget");
  if (server === null) line(se, "The server budget couldn't be read yet.");
  else {
    line(se, `${dollars(server.month_to_date_usd)} of ${dollars(server.budget_usd)} this month.`);
    taken(se, server.as_of);
  }

  const handovers = obj(doc.handovers);
  const ho = section("handovers", "Handovers, and each start-up gap");
  if (handovers === null) line(ho, "The handovers couldn't be read at the last write.");
  else {
    const table = d.createElement("table");
    const head = d.createElement("thead");
    const hr = d.createElement("tr");
    for (const h of ["When", "From → to", "Gap"]) {
      const th = d.createElement("th");
      th.textContent = h;
      hr.append(th);
    }
    head.append(hr);
    const body = d.createElement("tbody");
    const events = Array.isArray(handovers.events) ? handovers.events : [];
    for (const e of events.map(obj)) {
      if (e === null) continue;
      const tr = d.createElement("tr");
      for (const cell of [
        (str(e.at) ?? "").replace("T", " ").replace("Z", " UTC"),
        `${str(e.from) ?? "?"} → ${str(e.to) ?? "?"}`,
        gap(e.gap_s),
      ]) {
        const td = d.createElement("td");
        td.textContent = cell;
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(head, body);
    ho.append(table);
    taken(ho, handovers.taken_at);
  }

  const releases = obj(doc.releases);
  const re = section("releases", "The release on each host");
  for (const h of ["laptop", "ec2"] as const) {
    const r = obj(releases?.[h]);
    line(
      re,
      r === null ? `${h}: none yet.` : `${h}: ${str(r.release) ?? "unknown"} (${when(str(r.taken_at), now).text}).`,
    );
  }
}
