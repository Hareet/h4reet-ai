// vitest for the room (spec 002, plan §10): the build's checks, the built pages, and later the screens. Tests that
// need a document make their own with jsdom, so the default environment stays node and nothing reaches the network.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The smoke test runs one vite build first.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
