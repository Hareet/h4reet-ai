// T015's integration part (spec 007; FR-029, FR-030, SC-009; plan §6): the turn route's readiness at start. A ready
// topic answers; a changed prompt or fixed line closes every topic at the next start (409), and a changed section of
// another file closes free talk alone; a missing or invalid readiness file makes nothing ready, and the gateway still
// starts and answers hello.
import { afterEach, describe, expect, it } from "vitest";

import { committed, readinessText, twinWith } from "../helpers/twin.js";
import { twinStack, type TwinStack } from "../helpers/twin-stack.js";

const stacks: TwinStack[] = [];
afterEach(async () => {
  for (const t of stacks.splice(0)) await t.close();
});
async function stack(o: Parameters<typeof twinStack>[0] = {}): Promise<TwinStack> {
  const t = await twinStack(o);
  stacks.push(t);
  return t;
}

const opening = (feature: string) => ({ feature, path: "engineer", turns: [] });
const free = { feature: "free_talk", path: "engineer", turns: [{ role: "visitor", text: "What drives him?" }] };
const READY = readinessText({ topics: { "hobbies-and-travel": { ready: true } }, freeTalk: { ready: true } });

describe("readiness at the route (FR-030)", () => {
  it("answers a ready topic and free talk, and refuses an unready one with 409 and no call", async () => {
    const t = await stack({ twin: twinWith(READY) });
    t.stub.setCompletions({
      ok: { text: "An answer from the corpus.", inputTokens: 10, outputTokens: 5, finish: "stop" },
    });
    expect((await t.turn(opening("snowboard"))).statusCode).toBe(200);
    expect((await t.turn(opening("bicycle"))).statusCode).toBe(200);
    expect((await t.turn(free)).statusCode).toBe(200);
    const calls = t.stub.requests().filter((r) => r.path.endsWith("/chat/completions")).length;
    expect((await t.turn(opening("laptop"))).statusCode).toBe(409);
    expect(t.stub.requests().filter((r) => r.path.endsWith("/chat/completions")).length).toBe(calls);
  });

  it("closes every topic when the prompt or a fixed line changed since the Author marked it", async () => {
    const prompt = await stack({ twin: twinWith(READY, { prompt: `${committed("prompt.md")}\nOne more line.\n` }) });
    expect((await prompt.turn(opening("snowboard"))).statusCode).toBe(409);
    expect((await prompt.turn(free)).statusCode).toBe(409);
    const lines = await stack({
      twin: twinWith(READY, { lines: committed("lines.yaml").replace("his work", "his works") }),
    });
    expect((await lines.turn(opening("snowboard"))).statusCode).toBe(409);
  });

  it("makes nothing ready with the file missing or invalid, and still answers hello", async () => {
    for (const text of [null, "schema: 1\nnot: valid\n"]) {
      const t = await stack({ twin: twinWith(text) });
      expect((await t.turn(opening("snowboard"))).statusCode).toBe(409);
      expect((await t.turn(free)).statusCode).toBe(409);
      const hello = await t.s.api.inject({
        method: "POST",
        url: "/hello",
        headers: { "content-type": "application/json" },
        payload: "{}",
      });
      expect(hello.statusCode).toBe(200);
    }
  });
});
