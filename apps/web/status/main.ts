// /status/'s script (spec 001 T138; contracts/public-view.md §3): the document beside the page, cached by the edge for
// 60 s, and the relay's live status, both on the site's own origin; rendered by ./view.ts on load, then every 60 s
// while the page is visible. Nothing is written, stored, or sent but these two reads.
import { renderStatus, type StatusAnswer } from "./view";

const PERIOD_MS = 60_000;

async function read(url: string, init: RequestInit): Promise<StatusAnswer | null> {
  try {
    const response = await fetch(url, { ...init, headers: { Accept: "application/json" } });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { httpStatus: response.status, body };
  } catch {
    return null;
  }
}

async function refresh(root: HTMLElement): Promise<void> {
  const [document_, status] = await Promise.all([
    read("./latest.json", {}),
    read("../api/status", { cache: "no-store" }),
  ]);
  renderStatus(root, document_ !== null && document_.httpStatus === 200 ? document_.body : null, status, Date.now());
}

const root = document.getElementById("status");
if (root !== null) {
  void refresh(root);
  setInterval(() => {
    if (document.visibilityState === "visible") void refresh(root);
  }, PERIOD_MS);
}
