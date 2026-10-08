// vitest for the gateway (plan §7): unit tests, the adapter contract suite, and integration tests on PGlite.
// Everything runs in the sandbox: no Docker, no network beyond the sandbox's own loopback, and no credentials.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // PGlite boots a WASM Postgres per test file, which takes a second or two on a busy machine.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
