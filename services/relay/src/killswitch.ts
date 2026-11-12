// The kill switch, as the relay reads it (spec 001 FR-030, SC-008; contracts/relay-http.md §3, step 4;
// contracts/shared-state.md §2; data-model.md §1.4 and §3).
//
// Every request reads gateway.v_state as relay_ro, whose statement_timeout is 250 ms. The switch reads `normal` only
// from a row that says so; `degraded` answers kill_switch_tripped, no row store_uninitialized, and a read that fails
// answers store_unreachable at once: no grace on the last good read (FR-030; SC-008, "While the relay can't read the
// state, 100% of its answers are degraded"; contract §3 step 4; group 8's review A, I3). Unknown is degraded.

export interface StateRow {
  readonly state: string;
  readonly since: Date | string | null;
  readonly crossed: readonly string[] | string | null;
}

/** The store's one read. It throws on any failure: an error, a timeout, or a refused connection. */
export interface StateSource {
  read(): Promise<StateRow | null>;
}

export type DegradedCause = "kill_switch_tripped" | "store_unreachable" | "store_uninitialized";

export type Verdict =
  | { readonly kind: "normal" }
  | {
      readonly kind: "degraded";
      readonly cause: DegradedCause;
      readonly since: string | null;
      readonly ceilings: readonly string[] | null;
    };


const iso = (v: Date | string | null): string | null => {
  if (v === null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

/** `crossed`, as Postgres or a stub gives it, as the ceilings spec 000's body names: day and month, in that order. */
function ceilingsOf(crossed: StateRow["crossed"]): readonly string[] | null {
  const list = Array.isArray(crossed)
    ? crossed
    : typeof crossed === "string"
      ? crossed.replace(/^\{|\}$/g, "").split(",")
      : [];
  const out = ["day", "month"].filter((c) => list.includes(c));
  return out.length === 0 ? null : out;
}

export function verdictOf(row: StateRow | null): Verdict {
  if (row === null) return { kind: "degraded", cause: "store_uninitialized", since: null, ceilings: null };
  if (row.state === "normal") return { kind: "normal" };
  // degraded, or any state the relay doesn't know: fail closed.
  return { kind: "degraded", cause: "kill_switch_tripped", since: iso(row.since), ceilings: ceilingsOf(row.crossed) };
}

export class KillSwitch {
  private failingSince: number | null = null;
  private latest: Verdict | null = null;

  constructor(
    private readonly source: StateSource,
    private readonly now: () => number = Date.now,
  ) {}

  /** The verdict for a request starting now: the store's row, or store_unreachable the moment it can't be read. */
  async verdict(): Promise<Verdict> {
    let verdict: Verdict;
    try {
      const row = await this.source.read();
      verdict = verdictOf(row);
      this.failingSince = null;
    } catch {
      this.failingSince ??= this.now();
      verdict = {
        kind: "degraded",
        cause: "store_unreachable",
        since: iso(new Date(this.failingSince)),
        ceilings: null,
      };
    }
    this.latest = verdict;
    return verdict;
  }

  /** The status document's field: the last verdict's state, `unknown` for a store that can't be read or is empty. */
  state(): "normal" | "degraded" | "unknown" {
    const v = this.latest;
    if (v === null) return "unknown";
    if (v.kind === "normal") return "normal";
    return v.cause === "kill_switch_tripped" ? "degraded" : "unknown";
  }
}
