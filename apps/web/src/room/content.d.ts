// The modules the room's Vite plugins provide, bundled at build. `content`, the fixed messages and the manifest, is
// build/manifest.ts's roomContentModule's until build/room/plugin.ts's roomBundle() replaces it with the room's first
// data, whose manifest is Amendment B7's (spec 004, T096). The rest is roomBundle()'s (contracts/room-bundle.md §3):
// the index in the entry chunk, the 3D part in the lazy 3D chunk, and, in a drafts build only, the fixtures and the
// lookdev page's inputs, which a release build refuses to resolve (FR-066).
declare module "virtual:room-content" {
  export const content: import("../../build/manifest").RoomContent;
  /** The bundle's index (§3.1). */
  export const room: import("./compose/bundle").RoomIndex;
}

declare module "virtual:room-scene" {
  /** The bundle's 3D part (§3.2), imported only by the scene module. */
  const scene: import("./compose/bundle").RoomScene;
  export default scene;
}

declare module "virtual:room-fixtures" {
  /** The fixtures (§3.3), drafts builds only. */
  const fixtures: readonly import("../../build/room/emit").RoomFixture[];
  export default fixtures;
}

declare module "virtual:room-lookdev" {
  /** The lookdev page's inputs (§3.3), drafts builds only. */
  const lookdev: import("../../build/room/emit").RoomLookdev;
  export default lookdev;
}
