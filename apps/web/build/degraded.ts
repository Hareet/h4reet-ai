// The edge's own degraded answer (spec 001 FR-034, FR-066, FR-076; contracts/edge.md §4; research.md R-08):
// /_degraded/api.json, which CloudFront answers with, as a 503, when it can't reach the relay on the tunnel end, as
// while AWS has the tunnel end back. It is spec 000's degraded body (its contracts/gateway-http.md §2.5.2), cause
// no_host_serving, with stack null, as edge's own api_unavailable body has it: the relay, which would name the stack,
// isn't answering. A file has no request to name, so request_id is null too, and trace_id, as in edge's body.
// apps/web/test/site.test.ts holds it to spec 000's fields.
import type { Plugin } from "vite";

export const DEGRADED_PATH = "_degraded/api.json";

export interface DegradedBody {
  readonly state: "degraded";
  readonly cause: "no_host_serving";
  readonly detail: string;
  readonly ceilings: null;
  readonly stack: null;
  readonly since: null;
  readonly request_id: null;
  readonly trace_id: null;
}

/** The body, in spec 000's field order. The detail is the relay's own for the cause (services/relay/src/bodies.ts). */
export function degradedBody(): DegradedBody {
  return {
    state: "degraded",
    cause: "no_host_serving",
    detail: "No host is serving right now, so the twin can't answer; the site itself still works.",
    ceilings: null,
    stack: null,
    since: null,
    request_id: null,
    trace_id: null,
  };
}

/** The Vite plugin: emits /_degraded/api.json into every build, beside the room's pages. */
export function degradedAnswer(): Plugin {
  return {
    name: "h4-degraded-answer",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: DEGRADED_PATH, source: `${JSON.stringify(degradedBody())}\n` });
    },
  };
}
