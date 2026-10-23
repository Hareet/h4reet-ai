// The compositor's tree (spec 004; FR-006; R-08; contracts/room-bundle.md §1): the one way compose() reads its inputs,
// so it reads nothing else and a test can see what it read. A path is repository-relative and "/"-separated, with no
// empty, ".", or ".." segment, no backslash, and no NUL; "" is the root, which only `list` takes.
// - `read(path)` gives a file's bytes, or null when the path is absent, a folder, unreadable, or not a tree path;
// - `list(dir)` gives a folder's entries' names, sorted bytewise as UTF-8, or [] when it isn't a folder;
// - `log` holds every path read or listed, in order, as given; FR-006's data-only test holds it to the paths
//   contracts/room-data-files.md §1 lists, so it proves a data edit read no source file.
// Two trees: the file system under a root (the repository's, in a build), which follows no link, so nothing outside
// the root is ever read; and an overlay, a base tree with paths replaced or removed, for tests. Callers never change
// the bytes a tree gives.
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export interface Tree {
  /** A file's bytes; null when absent, a folder, unreadable, or not a tree path. */
  read(path: string): Uint8Array | null;
  /** A folder's entries' names, sorted bytewise; [] when absent or not a folder. */
  list(dir: string): readonly string[];
  /** Every path read or listed, in order. */
  readonly log: readonly string[];
}

const SEGMENT = /^[^/\\\0]+$/;

/** Whether `path` is a tree path: "" (the root), or "/"-separated segments, none empty, ".", or "..". */
export function isTreePath(path: string): boolean {
  return path === "" || path.split("/").every((s) => SEGMENT.test(s) && s !== "." && s !== "..");
}

/** Two names in bytewise order, as their UTF-8 bytes compare (not as JavaScript's UTF-16 units do). */
export function compareBytewise(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** The file system under `root`. A path through a link, the root's own excepted, reads as absent. */
export function fileTree(root: string): Tree {
  const log: string[] = [];
  let base: string | null;
  try {
    base = realpathSync(root);
  } catch {
    base = null;
  }
  /** The path's place on disk, or null when it isn't a tree path or a link lies on its way. */
  const resolve = (path: string): string | null => {
    if (base === null || !isTreePath(path)) return null;
    const full = path === "" ? base : join(base, ...path.split("/"));
    try {
      return realpathSync(full) === full ? full : null;
    } catch {
      return null;
    }
  };
  return {
    log,
    read(path) {
      log.push(path);
      const full = path === "" ? null : resolve(path);
      if (full === null) return null;
      try {
        return lstatSync(full).isFile() ? new Uint8Array(readFileSync(full)) : null;
      } catch {
        return null;
      }
    },
    list(dir) {
      log.push(dir);
      const full = resolve(dir);
      if (full === null) return [];
      try {
        return lstatSync(full).isDirectory() ? readdirSync(full).sort(compareBytewise) : [];
      } catch {
        return [];
      }
    },
  };
}

/**
 * `base` with `changes` over it: a path mapped to bytes is that file, added or replaced; a path mapped to null removes
 * it from the base, with everything under it. Files the overlay adds under a removed folder are still there, so a
 * folder can be replaced whole. Its log is its own; the base's calls don't reach it.
 */
export function overlayTree(base: Tree, changes: ReadonlyMap<string, Uint8Array | null>): Tree {
  const log: string[] = [];
  const files = new Map<string, Uint8Array>();
  const removed: string[] = [];
  /** Each folder the overlay's files make, with its entries. */
  const folders = new Map<string, Set<string>>();
  for (const [path, data] of changes) {
    if (!isTreePath(path) || path === "") continue;
    if (data === null) {
      removed.push(path);
      continue;
    }
    files.set(path, data);
    const parts = path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      const entries = folders.get(dir) ?? new Set<string>();
      entries.add(parts[i] as string);
      folders.set(dir, entries);
    }
  }
  const gone = (path: string): boolean => removed.some((r) => path === r || path.startsWith(`${r}/`));
  return {
    log,
    read(path) {
      log.push(path);
      if (path === "" || !isTreePath(path)) return null;
      const own = files.get(path);
      if (own !== undefined) return own;
      if (folders.has(path) || gone(path)) return null;
      return base.read(path);
    },
    list(dir) {
      log.push(dir);
      if (!isTreePath(dir)) return [];
      const names = new Set<string>(folders.get(dir));
      for (const name of base.list(dir)) if (!gone(dir === "" ? name : `${dir}/${name}`)) names.add(name);
      return [...names].sort(compareBytewise);
    },
  };
}

/** A tree holding only these files: an overlay on nothing. */
export function memoryTree(files: ReadonlyMap<string, Uint8Array>): Tree {
  const nothing: Tree = { log: [], read: () => null, list: () => [] };
  return overlayTree(nothing, files);
}
