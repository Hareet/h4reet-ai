// vitest for the room (spec 002, plan §10): the build's checks, the built pages, and later the screens. Tests that
// need a document make their own with jsdom, so the default environment stays node and nothing reaches the network.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // One release build and one drafts build of the site, made before any test file runs, which the smoke test, the
    // chunk test, and the built-site checks read (spec 004, T084).
    globalSetup: ["test/global-build.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
