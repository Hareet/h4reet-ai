// A GLB's embedded images under the site's unchanged CSPs (spec 004; FR-056, FR-075; research.md R-28, R-29). Neither
// spec 002's web image nor spec 001's edge allows blob:, and three.js's GLTFLoader decodes an embedded image through an
// object URL, then turns a texture that fails into no texture, so a model would draw untextured with no error. This
// plugin replaces the parser's image-source step, which the texture step calls for every image, PNG, JPEG, and WebP
// alike: it wraps the buffer view in a Blob and decodes it with createImageBitmap, neither premultiplied nor
// colour-converted, at most a side's cap for a visitor avatar (spec 009's texture_px, ledger.ts's capSides), and at
// half size in spec 003's reduced tier, which the room reads as a quality level of 1 or more when the model decodes. It returns a texture with flipY false, as glTF has it, and the image's MIME type, decoding each
// image once; it refuses an image `uri`, and never makes a URL. It counts what it decodes against what the materials'
// texture steps asked for, so a piece short of the images its materials use fails rather than drawing untextured.
// test/room/gltf-images.test.ts pins the loader's internals this relies on, in three 0.186.1, whose EXT_texture_webp
// makes no support probe that the plugin would have to mark supported first.
//
// It belongs to the room's 3D chunk, which never imports the GLB reader in src/room/glb/ (R-08), so it reads no image
// header: a reduced or capped image is decoded, then resized to its sides (half its decoded sides, after any cap), and
// the full-size bitmap closed.
import { Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF, GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

import { capSides, textureBytes } from "./ledger";

/**
 * createImageBitmap's options for every decode: the pixels as stored, neither premultiplied nor colour-converted, as
 * three's own ImageBitmapLoader decodes a glTF image (GLTFLoader sets it no orientation, so none is flipped).
 */
export const DECODE: Readonly<ImageBitmapOptions> = { premultiplyAlpha: "none", colorSpaceConversion: "none" };

/** createImageBitmap, which the page takes from its window, or a stand-in for it. */
export type Decode = (source: Blob | ImageBitmap, options: ImageBitmapOptions) => Promise<ImageBitmap>;

export interface ImageOptions {
  /** Half size: spec 003's reduced tier, a quality level of 1 or more when the model decodes (R-28, step 6). */
  readonly reduced: boolean;
  readonly decode: Decode;
  /** Spec 009's decode cap (its FR-024; plan.md R-11): an image larger on a side decodes at most this many pixels a
   *  side, keeping its aspect, before any halving. A visitor avatar's model takes the 3D part's texture_px; the room's
   *  models take none. */
  readonly maxSide?: number;
}

/** An image as decoded: its size, after any halving, and its MIME type. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
}

/** The image step for one parse: `plugin` goes to the GLTFLoader that parses it, through register(). */
export interface RoomImages {
  readonly plugin: (parser: GLTFParser) => GLTFLoaderPlugin;
  /** The images the materials' textures asked for, by index. */
  readonly requested: ReadonlySet<number>;
  /** The images decoded, by index. */
  readonly decoded: ReadonlyMap<number, DecodedImage>;
  /** Closes every bitmap decoded, and any decoded later: for a model that won't be uploaded. */
  close(): void;
}

/** What GLTFLoader keys the plugin by; no glTF extension has the name. */
const NAME = "h4_room_images";

/** An image's entry in the glTF JSON, as far as the step reads it. */
interface ImageDef {
  readonly uri?: unknown;
  readonly bufferView?: unknown;
  readonly mimeType?: unknown;
}

export function roomImages(options: ImageOptions): RoomImages {
  const requested = new Set<number>();
  const decoded = new Map<number, DecodedImage>();
  const bitmaps: ImageBitmap[] = [];
  let closed = false;

  async function source(parser: GLTFParser, index: number): Promise<Texture> {
    const def = (parser.json as { images?: readonly ImageDef[] }).images?.[index];
    if (def?.uri !== undefined) throw new Error(`images[${index}]: a uri, which the room never loads (R-29)`);
    if (typeof def?.bufferView !== "number") throw new Error(`images[${index}]: no buffer view`);
    const view = (await parser.getDependency("bufferView", def.bufferView)) as ArrayBuffer;
    const mimeType = typeof def.mimeType === "string" ? def.mimeType : "";
    let bitmap = await options.decode(new Blob([view], { type: mimeType }), DECODE);
    const [width, height] = capSides(bitmap.width, bitmap.height, options.maxSide ?? null, options.reduced);
    if (options.reduced || width !== bitmap.width || height !== bitmap.height) {
      const full = bitmap;
      try {
        bitmap = await options.decode(full, { ...DECODE, resizeWidth: width, resizeHeight: height });
      } finally {
        full.close();
      }
    }
    if (closed) {
      bitmap.close();
      throw new Error(`images[${index}]: decoded after the model was closed`);
    }
    bitmaps.push(bitmap);
    decoded.set(index, { width: bitmap.width, height: bitmap.height, mimeType });
    const texture = new Texture(bitmap);
    texture.flipY = false;
    texture.userData.mimeType = mimeType;
    texture.needsUpdate = true;
    return texture;
  }

  return {
    plugin(parser) {
      const sources = new Map<number, Promise<Texture>>();
      parser.loadImageSource = (index) => {
        requested.add(index);
        const cached = sources.get(index);
        if (cached) return cached.then((texture) => texture.clone());
        const texture = source(parser, index);
        sources.set(index, texture);
        return texture;
      };
      return { name: NAME };
    },
    requested,
    decoded,
    close() {
      closed = true;
      for (const bitmap of bitmaps) bitmap.close();
    },
  };
}

/** A model parsed with the room's image step, every image its materials use decoded. */
export interface ParsedModel {
  readonly gltf: GLTF;
  /** The images decoded, by index. */
  readonly images: ReadonlyMap<number, DecodedImage>;
  /** FR-053's texture memory of those images, as the ledger will count them. */
  readonly textureBytes: number;
  /** Closes every bitmap decoded: for a piece the ledger skips. */
  close(): void;
}

/**
 * Parses a GLB with a GLTFLoader of its own and the room's image step. Rejects when the file doesn't parse, or when
 * fewer images decoded than its materials asked for (R-29), closing what it decoded.
 */
export async function parseModel(data: ArrayBuffer, options: ImageOptions): Promise<ParsedModel> {
  const images = roomImages(options);
  let gltf: GLTF;
  try {
    gltf = await new GLTFLoader().register(images.plugin).parseAsync(data, "");
  } catch (error) {
    images.close();
    throw error;
  }
  if (images.decoded.size < images.requested.size) {
    images.close();
    throw new Error(`decoded ${images.decoded.size} of the ${images.requested.size} images its materials use`);
  }
  let bytes = 0;
  for (const image of images.decoded.values()) bytes += textureBytes(image.width, image.height);
  return { gltf, images: images.decoded, textureBytes: bytes, close: () => images.close() };
}
