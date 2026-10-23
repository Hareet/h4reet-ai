// pako 2.1.0 ships no types (research.md R-26): only what gzip.ts calls, as pako's own documentation gives it.
declare module "pako" {
  /** zlib's deflate in a gzip wrapper (RFC 1952), in one call: `level` 0 to 9, and the header's `time`, in seconds
   *  since 1970, and `os`. It sets `gzip` on the options it is given. */
  export function gzip(data: Uint8Array, options: { level: number; header: { time: number; os: number } }): Uint8Array;
}
