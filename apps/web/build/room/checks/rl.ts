// RL, the live configuration (spec 004; FR-042, FR-044, FR-045, FR-071, FR-074, FR-075; Amendments A1, A4, A7, B6;
// R-62; contracts/room-data-files.md §13.9, §14; contracts/tier-signal.md §1). RL1's figures, the poll interval and the
// freshness window, are the loader's (schema.ts). The rest hold each live switch at `site` to its row of
// docs/data-flow-disclosure.md, read from the tree being built, so they hold in every build (FR-074), by its columns'
// headers and its row IDs under Amendment A7's scheme, where the first row written keeps its ID (spec 001's status row
// is V7):
// - RL2, `source: site`: a row V7 whose From → To names GET /api/status, whose Trigger names the room and its cadence as
//   `every <poll_s> s` or `every <poll_s> seconds`, and whose How to switch it off names "Pause the room" (FR-074; A4);
// - RL3, `asset_events: site`: a row V6 whose From → To names POST /api/events (FR-071);
// - RL4, `turn: site`: a row V2 whose Carries names the turn's estimated cost and its route (FR-075; B6).
// A table is read as spec 002's disclosure page reads it (build/disclosure.ts): its first row names its columns, the
// delimiter row follows, and a cell is the text between two pipes. A finding names apps/web/room/scene.yaml at the
// switch's key, and its reason names the row it needs; it quotes neither the disclosure nor the data.
import { decodeUtf8 } from "../../../src/room/glb/json";
import type { Live } from "../schema";
import type { Family, RuleId } from "./family";

export const DISCLOSURE = "docs/data-flow-disclosure.md";

/** A disclosure row: its cells by their columns' headers. */
export type DisclosureRow = ReadonlyMap<string, string>;

/** A row's cells: the text between its pipes, its whitespace collapsed. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim().replace(/\s+/g, " "));
}

const isDelimiter = (line: string): boolean => cells(line).every((c) => /^:?-{3,}:?$/.test(c));

/** Every row of every pipe table in `text`, each keyed by its table's headers. */
export function disclosureRows(text: string): DisclosureRow[] {
  const lines = text.split("\n");
  const rows: DisclosureRow[] = [];
  let headers: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("|")) {
      headers = null;
    } else if (headers !== null) {
      const row = cells(line);
      rows.push(new Map(headers.map((h, k) => [h, row[k] ?? ""])));
    } else if (isDelimiter(lines[i + 1]?.trim() ?? "")) {
      headers = cells(line);
      i++;
    }
  }
  return rows;
}

/** What a switch at `site` needs of its row: each part a column and what it must name. */
interface Need {
  readonly rule: RuleId;
  readonly key: "source" | "asset_events" | "turn";
  /** The switch, on: its value is `site`. */
  readonly on: string;
  readonly row: string;
  readonly spec: string;
  readonly parts: readonly {
    readonly column: string;
    readonly names: string;
    readonly holds: (cell: string, live: Live) => boolean;
  }[];
}

/** A route named as such, not as the start of a longer path. */
const route = (method: string, path: string): RegExp =>
  new RegExp(`${method} ${path.replace(/\//g, "\\/")}(?![\\w/.-])`);

const NEEDS: readonly Need[] = [
  {
    rule: "RL2",
    key: "source",
    on: "the status source is on",
    row: "V7",
    spec: "FR-074",
    parts: [
      { column: "From → To", names: "GET /api/status", holds: (cell) => route("GET", "/api/status").test(cell) },
      {
        column: "Trigger",
        names: "the room and its cadence, every <poll_s> s or every <poll_s> seconds",
        holds: (cell, live) =>
          /\broom\b/i.test(cell) && new RegExp(`\\bevery ${live.poll_s} (?:s|seconds)\\b`).test(cell),
      },
      { column: "How to switch it off", names: '"Pause the room"', holds: (cell) => cell.includes("Pause the room") },
    ],
  },
  {
    rule: "RL3",
    key: "asset_events",
    on: "the asset events are on",
    row: "V6",
    spec: "FR-071",
    parts: [
      { column: "From → To", names: "POST /api/events", holds: (cell) => route("POST", "/api/events").test(cell) },
    ],
  },
  {
    rule: "RL4",
    key: "turn",
    on: "the turn route is on",
    row: "V2",
    spec: "FR-075",
    parts: [
      {
        column: "Carries",
        names: "the turn's estimated cost and its route",
        holds: (cell) => /\bestimated cost\b/i.test(cell) && /\broute\b/i.test(cell),
      },
    ],
  },
];

/** The disclosure's rows, or why there are none to read. */
type Disclosure = readonly DisclosureRow[] | "missing" | "not UTF-8";

/** What the disclosure lacks for `need`, or null where a row of its ID holds every part. Of several rows with that ID,
 *  the one that lacks the fewest parts is named. */
function lack(need: Need, disclosure: Disclosure, live: Live): string | null {
  if (disclosure === "missing") return `the tree holds no ${DISCLOSURE} for its row ${need.row}`;
  if (disclosure === "not UTF-8") return `${DISCLOSURE} isn't UTF-8, so its row ${need.row} can't be read`;
  const candidates = disclosure.filter((r) => r.get("ID") === need.row);
  if (candidates.length === 0) return `${DISCLOSURE} has no row ${need.row}`;
  const missing = candidates.map((r) => need.parts.filter((p) => !p.holds(r.get(p.column) ?? "", live)));
  const fewest = missing.reduce((a, b) => (b.length < a.length ? b : a));
  if (fewest.length === 0) return null;
  return `row ${need.row} of ${DISCLOSURE}: ${fewest.map((p) => `its ${p.column} doesn't name ${p.names}`).join("; ")}`;
}

/** RL: each live switch at `site` against its disclosure row. */
export const rl: Family = (ctx) => {
  const scene = ctx.room.scene;
  if (!scene) return;
  const live = scene.value.live;
  const on = NEEDS.filter((need) => live[need.key] === "site");
  if (on.length === 0) return;
  const data = ctx.tree.read(DISCLOSURE);
  const text = data === null ? null : decodeUtf8(data);
  const disclosure: Disclosure = data === null ? "missing" : text === null ? "not UTF-8" : disclosureRows(text);
  for (const need of on) {
    const missing = lack(need, disclosure, live);
    if (missing !== null)
      ctx.report(need.rule, scene.file, ctx.path("live", need.key), `${need.on}, but ${missing} (${need.spec})`);
  }
};
