// The room's texture ledger (spec 004; FR-053, SC-006; research.md R-28, R-29; contracts/plain-model-fit.md §8.2):
// every texture the room uploads, counted by FR-053's formula, width × height × 4 bytes and a third more for mipmaps,
// against the whole scene's 96,000,000 bytes on a phone, the cap the compositor's RK3 holds the scene to before it
// ships. An image counts once however many textures share it (GLTFLoader's clones, a piece's several placements), from
// its upload until the last texture sharing it is disposed. The loader asks fits() before it swaps a piece in, and a
// piece that wouldn't fit keeps its stand-in. A decoded bitmap is closed once uploaded: the GPU holds its pixels, and
// keeping them would come close to doubling a phone's texture memory (R-28).
import type { Texture } from "three";

/** FR-053's starting figure for the whole scene's texture memory on a phone. */
export const SCENE_TEXTURE_BYTES = 96_000_000;

/** FR-053's formula, ⌊16 · w · h / 3⌋, as the fit check measures an image; exact below 2^49 pixels. */
export function textureBytes(width: number, height: number): number {
  return Math.floor((16 * width * height) / 3);
}

/** What uploads a texture at once: the renderer's initTexture. */
export interface Uploader {
  initTexture(texture: Texture): void;
}

export interface TextureLedger {
  readonly limit: number;
  /** What the images uploaded through it hold, in bytes, until their textures are disposed. */
  readonly bytes: number;
  /** Whether `more` bytes stay within the limit beside what is counted. */
  fits(more: number): boolean;
  /**
   * Uploads the textures through the renderer, counting each image once however many of them share it, then closes
   * every decoded bitmap among them. Hand it every texture of a model at once: a bitmap closed is gone for a texture
   * uploaded later.
   */
  upload(renderer: Uploader, textures: Iterable<Texture>): void;
}

interface Counted {
  readonly bytes: number;
  readonly users: Set<Texture>;
}

export function createTextureLedger(limit: number = SCENE_TEXTURE_BYTES): TextureLedger {
  const images = new Map<Texture["source"], Counted>();
  let bytes = 0;

  const disposed = (event: { readonly target: Texture }): void => {
    const texture = event.target;
    texture.removeEventListener("dispose", disposed);
    const counted = images.get(texture.source);
    if (!counted?.users.delete(texture) || counted.users.size > 0) return;
    images.delete(texture.source);
    bytes -= counted.bytes;
  };

  return {
    limit,
    get bytes() {
      return bytes;
    },
    fits: (more) => bytes + more <= limit,
    upload(renderer, textures) {
      const handed = [...textures];
      try {
        for (const texture of handed) {
          let counted = images.get(texture.source);
          if (!counted) {
            const image = texture.image as { width?: number; height?: number } | null;
            counted = { bytes: textureBytes(image?.width ?? 0, image?.height ?? 0), users: new Set() };
            images.set(texture.source, counted);
            bytes += counted.bytes;
          }
          if (!counted.users.has(texture)) {
            counted.users.add(texture);
            texture.addEventListener("dispose", disposed);
          }
          renderer.initTexture(texture);
        }
      } finally {
        for (const texture of handed) {
          const image = texture.image as { close?: unknown } | null;
          if (typeof image?.close === "function") (image as ImageBitmap).close();
        }
      }
    },
  };
}
