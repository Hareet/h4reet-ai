// The relay with no telemetry SDK (OTEL_EXPORTER_OTLP_ENDPOINT unset, as on a host whose collector isn't configured):
// no tracer provider and no context manager are registered, so no span is ever "active". Found by the image's first
// run on the agents' engine (group 8): every request then failed as host_error. This file registers nothing, and
// vitest runs it in a worker of its own, so the global API is as a bare process has it.
import { describe, expect, it } from "vitest";

import { assemble, prepare } from "../src/start.js";
import { captureLog, Clock, deadUrl, relayEnv, StubStore, TEST_PUBLIC, EDGE_PEER, VIEWER_HEADER } from "./helpers.js";

describe("the relay without a telemetry SDK", () => {
  it("answers its status, and hello's degraded answer, as with one", async () => {
    const clock = new Clock();
    const ready = prepare(relayEnv(await deadUrl(), await deadUrl()), TEST_PUBLIC, clock.now);
    if (ready.kind !== "ready") throw new Error(ready.lines.join("\n"));
    const running = assemble(ready, new StubStore(), undefined, captureLog().logger, clock.now);
    const status = await running.listeners.internal.inject({ method: "GET", url: "/api/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ serving: "none", kill_switch: "normal", hello_would_get: "no_host_serving" });
    const hello = await running.listeners.edge.inject({
      method: "POST",
      url: "/api/hello",
      remoteAddress: EDGE_PEER,
      headers: { "cloudfront-viewer-address": VIEWER_HEADER, "content-type": "application/json" },
      payload: "{}",
    });
    expect(hello.statusCode).toBe(503);
    expect(hello.json().cause).toBe("no_host_serving");
  });
});
