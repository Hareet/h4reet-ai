// POST /room/events: the room's usage events (spec 002, FR-054; contracts/room-events.md §3). edge's x005 listener
// forwards the site's /api/room/events here, rate-limited and capped at 512 bytes (§2). Each event is a count and
// nothing more: no log record, no span attribute from the body, no store statement, no ledger row, no model call, and
// no meter admission. It sits outside /hello, so admission and routing never see it.
//
// The checks, in order, each refusal counted by its reason in h4.room.events.refused:
// 1. Content-Type is application/json or text/plain, since a beacon may send either: else 415 (content_type);
// 2. the body is a JSON object with exactly `kind`, plus `id` when the kind takes one, both strings: else 400 (shape);
// 3. `kind` is in config/room-events.yaml's kinds: else 400 (kind);
// 4. `id` is in its objects (object_selected) or items (item_selected): else 400 (id).
// An accepted event increments h4.room.events{kind, id}, with id "-" when the kind takes none, and answers 204.
// Without the event list (config/room-events.yaml missing or invalid at start), every event that passes 1 and 2 is
// 400 (id): there is nothing to check its kind and ID against.
//
// The route lives in a scope of its own, so its catch-all body parser, which reads any body as text for the route to
// check, doesn't reach the listener's other routes: they still refuse anything but JSON (gateway-http.md §1).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { RoomEventsConfig } from "../config/room-events.js";
import type { GatewayMetrics, RoomEventRefusal } from "../telemetry/metrics.js";

export const ROOM_EVENTS_PATH = "/room/events";

/**
 * The kinds that take an ID, and the list it comes from; every other kind takes none (contracts/room-events.md §1).
 * A Map, so a kind named like an Object property (`constructor`, `toString`) finds nothing inherited.
 */
const ID_LISTS: ReadonlyMap<string, "objects" | "items"> = new Map([
  ["object_selected", "objects"],
  ["item_selected", "items"],
]);

const MEDIA_TYPES = new Set(["application/json", "text/plain"]);

export interface RoomEventsDeps {
  /** config/room-events.yaml, as read at start; null when it was missing or invalid. */
  events: RoomEventsConfig | null;
  metrics: GatewayMetrics;
}

type Checked =
  | { ok: true; kind: string; id: string }
  | { ok: false; reason: Exclude<RoomEventRefusal, "content_type">; field: string; detail: string };

const SHAPE = { ok: false, reason: "shape", field: "body", detail: "must be {kind} or {kind, id}" } as const;

/** Steps 2 to 4, on the body as text. Nothing here keeps or reports the body. */
function check(text: unknown, events: RoomEventsConfig | null): Checked {
  let body: unknown;
  try {
    body = JSON.parse(typeof text === "string" ? text : "");
  } catch {
    return SHAPE;
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return SHAPE;
  const keys = Object.keys(body);
  const { kind, id } = body as { kind?: unknown; id?: unknown };
  if (typeof kind !== "string" || keys.some((k) => k !== "kind" && k !== "id")) return SHAPE;
  if (id !== undefined && typeof id !== "string") return SHAPE;
  if (events === null) return { ok: false, reason: "id", field: "id", detail: "the room's event list isn't loaded" };
  if (!events.kinds.has(kind)) return { ok: false, reason: "kind", field: "kind", detail: "unknown kind" };
  const list = ID_LISTS.get(kind);
  if ((list === undefined) !== (id === undefined)) return SHAPE;
  if (list === undefined || id === undefined) return { ok: true, kind, id: "-" };
  if (!events[list].has(id)) return { ok: false, reason: "id", field: "id", detail: "unknown ID for its kind" };
  return { ok: true, kind, id };
}

const mediaType = (header: string | undefined): string => (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

export function registerRoomEvents(api: FastifyInstance, deps: RoomEventsDeps): void {
  const unsupported = (req: FastifyRequest, reply: FastifyReply) => {
    deps.metrics.roomEventRefused("content_type");
    return reply.code(415).send({ error: "unsupported_media_type", request_id: req.id });
  };

  void api.register(async function roomEvents(scope) {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => done(null, body));
    // A refusal Fastify makes before the handler: a Content-Type header that doesn't parse (415), or a body over the
    // listener's limit or shorter than its Content-Length (4xx). The listener's error handler answers it, as on every
    // route; here it is counted.
    scope.addHook("onError", async (_req, _reply, err) => {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      if (status === 415) deps.metrics.roomEventRefused("content_type");
      else if (status >= 400 && status < 500) deps.metrics.roomEventRefused("shape");
    });
    scope.post(ROOM_EVENTS_PATH, async function roomEvent(req, reply) {
      if (!MEDIA_TYPES.has(mediaType(req.headers["content-type"]))) return unsupported(req, reply);
      const checked = check(req.body, deps.events);
      if (!checked.ok) {
        deps.metrics.roomEventRefused(checked.reason);
        return reply
          .code(400)
          .send({ error: "invalid_request", field: checked.field, detail: checked.detail, request_id: req.id });
      }
      deps.metrics.roomEvent(checked.kind, checked.id);
      return reply.code(204).send();
    });
  });
}
