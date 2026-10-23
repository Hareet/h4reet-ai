// A Vite plugin's hooks, called as Vite calls them, for the room's plugin tests (spec 004, T083, T069): a stand-in for
// the plugin context that records each warning a hook gives, the error it fails with, each file it emits, and each file
// it watches; and a call that runs a hook, a function or an object holding its handler, with that context as `this`.
import type { Plugin } from "vite";

/** A file a hook emitted: an asset, by its name under dist/. */
export interface Emitted {
  readonly fileName: string;
  readonly source: string | Uint8Array;
}

/** What the hooks did through their context, and the context itself. */
export interface HookContext {
  readonly warnings: string[];
  readonly errors: string[];
  readonly emitted: Emitted[];
  readonly watched: string[];
  /** A hook's `this`. Its `error` throws, as Rolldown's does. */
  readonly context: object;
}

export function hookContext(): HookContext {
  const warnings: string[] = [];
  const errors: string[] = [];
  const emitted: Emitted[] = [];
  const watched: string[] = [];
  const context = {
    warn(message: unknown): void {
      warnings.push(String(message));
    },
    error(message: unknown): never {
      errors.push(String(message));
      throw new Error(String(message));
    },
    emitFile(file: { type: string; fileName?: string; source?: string | Uint8Array }): string {
      if (file.type !== "asset" || file.fileName === undefined || file.source === undefined)
        throw new Error("the room's plugin emits assets only, each with its file name and its source");
      emitted.push({ fileName: file.fileName, source: file.source });
      return file.fileName;
    },
    addWatchFile(id: string): void {
      watched.push(id);
    },
  };
  return { warnings, errors, emitted, watched, context };
}

/** Runs a plugin's hook with `context` as `this`: the hook itself, or the handler of a hook given as an object. */
export function callHook(
  plugin: Plugin,
  name: "buildStart" | "resolveId" | "load" | "generateBundle",
  context: object,
  ...args: unknown[]
): unknown {
  const hook: unknown = plugin[name];
  const handler = typeof hook === "function" ? hook : (hook as { handler?: unknown } | undefined)?.handler;
  if (typeof handler !== "function") throw new Error(`the plugin has no ${name} hook`);
  return (handler as (...a: unknown[]) => unknown).apply(context, args);
}
