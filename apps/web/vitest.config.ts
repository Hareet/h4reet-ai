// vitest for the room (spec 002, plan §10): the build's checks, the built pages, and later the screens. Tests that
// need a document make their own with jsdom, so the default environment stays node and nothing reaches the network.
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The 3D part the site's build gives the scene module (build/room/plugin.ts): the tests take the repository's, as
    // test/helpers/room-scene.ts composes it (spec 004, T098).
    alias: { "virtual:room-scene": fileURLToPath(new URL("test/helpers/room-scene.ts", import.meta.url)) },
  },
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
