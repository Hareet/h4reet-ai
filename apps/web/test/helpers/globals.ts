// Spies on the request and storage APIs a page's globals offer (spec 004, T122, T128; contracts/lookdev.md §4, §9;
// room-live-state-telemetry.md §3), for the modules that run without a window: fetch, XMLHttpRequest, WebSocket,
// EventSource, navigator.sendBeacon, and URL.createObjectURL; document.cookie, localStorage, sessionStorage, indexedDB,
// and caches. Each is stubbed on globalThis, so a test holds a module to no request and no storage, read or write, even
// one it reached without being handed. A test file calls vi.unstubAllGlobals() after each test; the URL spy is
// restored with the mocks.
import { vi } from "vitest";

export interface GlobalSpies {
  /** Every request made through a global, and every object URL: `fetch <url>`, `sendBeacon <url>`, and so on. */
  readonly network: string[];
  /** Every touch of document.cookie, localStorage, sessionStorage, indexedDB, or caches. */
  readonly storage: string[];
}

const urlOf = (input: unknown): string => (input instanceof Request ? input.url : String(input));

/** Stubs every request and storage global with a spy that records its use and serves nothing. */
export function spyOnGlobals(): GlobalSpies {
  const spies: GlobalSpies = { network: [], storage: [] };
  vi.stubGlobal("fetch", (input: unknown) => {
    spies.network.push(`fetch ${urlOf(input)}`);
    return Promise.reject(new TypeError("no network in this test"));
  });
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      open(method: string, url: string): void {
        spies.network.push(`XMLHttpRequest ${method} ${url}`);
      }
      send(): void {}
    },
  );
  for (const name of ["WebSocket", "EventSource"]) {
    vi.stubGlobal(
      name,
      class {
        constructor(url: string) {
          spies.network.push(`${name} ${url}`);
        }
      },
    );
  }
  // An empty user agent: three's GLTFLoader reads one to pick its image loader.
  vi.stubGlobal("navigator", {
    userAgent: "",
    sendBeacon: (url: string) => (spies.network.push(`sendBeacon ${url}`), true),
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    spies.network.push("URL.createObjectURL");
    return "blob:refused";
  });
  const doc = {};
  Object.defineProperty(doc, "cookie", {
    get: () => (spies.storage.push("document.cookie read"), ""),
    set: () => spies.storage.push("document.cookie write"),
  });
  vi.stubGlobal("document", doc);
  for (const name of ["localStorage", "sessionStorage", "indexedDB", "caches"]) {
    vi.stubGlobal(
      name,
      new Proxy(
        {},
        {
          get: (_, key) => (spies.storage.push(`${name}.${String(key)}`), undefined),
          set: (_, key) => (spies.storage.push(`${name}.${String(key)} =`), true),
        },
      ),
    );
  }
  return spies;
}
