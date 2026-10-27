// The module build/manifest.ts's Vite plugin provides: the room's fixed messages and manifest, bundled at build.
declare module "virtual:room-content" {
  export const content: import("../../build/manifest").RoomContent;
}
