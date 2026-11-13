// vitest for the relay (spec 001 contracts/relay-http.md; plan §10): its contract suite, with stub hosts on loopback
// and a stub store. Everything runs in the sandbox: no Docker, no network beyond loopback, and no credentials.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
