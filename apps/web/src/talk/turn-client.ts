// The room's turn client (spec 007; FR-033, FR-036; plan §7, departure D2): the sender main.ts gives the room, which the
// talk panel calls for each turn. A same-origin POST /api/room/turn, credentials omitted and nothing cached, with a JSON
// body of exactly the request (spec 002's contract §2); its end reported once, as spec 004's TurnResult: the whole
// parsed body with its status, or `network` for a fetch that failed, `aborted` for the panel's abort or the 35-second
// timeout on the room's Clock, and `body` for a body that didn't parse. It throws nothing, stores nothing, and reads
// no cookie. The history window keeps the newest turns within the per-turn limits, the oldest dropped first.
import type { Turn } from "../choice/visit";
import type { Clock } from "../room/clock";
import type { TurnResult } from "../room/signals/turn-cost";
import type { SendTurn, TurnRequest } from "./talk";

export const TURN_URL = "/api/room/turn";
/** No answer within 35 seconds is a lost turn (FR-036): above the edge's 30-second read timeout. */
export const TURN_TIMEOUT_MS = 35_000;

export interface TurnClientOptions {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  clock: Pick<Clock, "setTimeout" | "clearTimeout">;
  timeoutMs?: number;
}

export function createTurnSender(o: TurnClientOptions): SendTurn {
  return (request: TurnRequest, ended: (result: TurnResult) => void, signal?: AbortSignal): void => {
    let done = false;
    const end = (result: TurnResult): void => {
      if (done) return;
      done = true;
      ended(result);
    };
    if (signal?.aborted) {
      end({ kind: "error", error: "aborted" });
      return;
    }
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = o.clock.setTimeout(abort, o.timeoutMs ?? TURN_TIMEOUT_MS);
    const finish = (result: TurnResult): void => {
      o.clock.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      end(result);
    };
    const body = JSON.stringify({ feature: request.feature, path: request.path, turns: request.turns });
    o.fetch(TURN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        let text: string;
        try {
          text = await response.text();
        } catch {
          finish({ kind: "error", error: controller.signal.aborted ? "aborted" : "body" });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          finish({ kind: "error", error: "body" });
          return;
        }
        finish({ kind: "response", status: response.status, body: parsed });
      })
      .catch(() => finish({ kind: "error", error: controller.signal.aborted ? "aborted" : "network" }));
  };
}

/** The newest turns that fit the limits, the oldest dropped first; a turn is never split. */
export function historyWindow(
  turns: readonly Turn[],
  limits: { historyMaxTurns: number; historyMaxChars: number },
): Turn[] {
  const out: Turn[] = [];
  let chars = 0;
  for (let i = turns.length - 1; i >= 0 && out.length < limits.historyMaxTurns; i -= 1) {
    const t = turns[i];
    if (t === undefined) continue;
    const length = [...t.text].length;
    if (chars + length > limits.historyMaxChars) break;
    chars += length;
    out.unshift({ role: t.role, text: t.text });
  }
  return out;
}
