// T062 (spec 016; FR-042, FR-043; plan.md R-14, K5; spec 003, FR-033; SC-012): the credits page and the toolbar's
// Credits link.
// - The build writes credits/index.html from assets/CREDITS.md: its first part a list of each `##` asset directory,
//   each linking to its section's anchor, the twin's among them; the rest the file's records, escaped.
// - From the room, in 3D and 2D, by pointer and keyboard, "Credits" in the toolbar is a same-origin link to the page,
//   and the page's contents link reaches the twin's records: two activations.
// - The HUD's compact bar holds it: spec 014's model counts six tiles, Credits among them (hud-model.test.ts).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

import { anchorOf, directories, renderCredits } from "../../build/credits";
import { REPO, button, enter, flush, intoRoom, start, textOf } from "../helpers/room";

const CREDITS = readFileSync(join(REPO, "assets/CREDITS.md"), "utf8");
const builds = inject("siteBuilds");

describe("the credits page (FR-042, FR-043)", () => {
  it("lists each asset directory first, each linking to its section's anchor, the twin's among them", () => {
    const dirs = directories(CREDITS);
    expect(dirs).toContain("`assets/twin`");
    const page = new JSDOM(renderCredits(CREDITS)).window.document;
    const links = [...page.querySelectorAll("nav a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(dirs.map((d) => `#${anchorOf(d)}`));
    expect(anchorOf("`assets/twin`")).toBe("assets-twin");
    const twin = page.getElementById("assets-twin");
    expect(twin?.localName).toBe("h2");
    expect(textOf(twin)).toBe("assets/twin");
    // The twin's records follow its heading: each of its files' entries, up to the next directory.
    const after: string[] = [];
    for (let n = twin?.nextElementSibling; n && n.localName !== "h2"; n = n.nextElementSibling) after.push(textOf(n));
    expect(after.join("\n")).toContain("twin.glb");
    expect(after.join("\n")).toContain("still.png");
  });

  it("escapes every character of the source, and keeps the site's AI disclosure and a way back", () => {
    const html = renderCredits("# Credits\n\n## `assets/<x>`\n\n- a <script>alert(1)</script> line\n");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(new JSDOM(html).window.document.querySelector("header")?.textContent).toContain(
      "You're talking with an AI representation of the Author, not the Author.",
    );
    expect(html).toContain('<a href="../">Back to the room</a>');
  });

  it.each(["release", "drafts"] as const)(
    "is in the %s build at credits/index.html, rendered from the file",
    (kind) => {
      const path = join(builds[kind], "credits/index.html");
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(renderCredits(CREDITS));
    },
  );
});

describe("the toolbar's Credits link (FR-042; SC-012)", () => {
  const creditsLink = (doc: Document): HTMLAnchorElement | null =>
    [...doc.querySelectorAll<HTMLAnchorElement>(".room-toolbar a")].find((a) => textOf(a) === "Credits") ?? null;

  it("is a same-origin link to the credits page, after How data flows, in 3D", async () => {
    const v = start({ webgl: true });
    await enter(v, "engineer", "woman");
    const link = creditsLink(v.doc);
    expect(link?.getAttribute("href")).toBe("./credits/");
    const tiles = [...v.doc.querySelectorAll(".room-toolbar > *")].map((t) => textOf(t));
    expect(tiles.indexOf("Credits")).toBe(tiles.indexOf("How data flows") + 1);
    // A link a keyboard reaches: no tabindex below 0, nothing inert once the room is open.
    expect(link?.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("stays in 2D, from the start and after the visitor's switch", async () => {
    const flat = start({ webgl: false });
    await enter(flat, "engineer", "woman");
    expect(creditsLink(flat.doc)?.getAttribute("href")).toBe("./credits/");
    const v = start({ webgl: true });
    await intoRoom(v);
    button(v.doc, "2D view").click();
    await flush();
    expect(creditsLink(v.doc)?.getAttribute("href")).toBe("./credits/");
  });

  it("reaches the twin's records in two activations: Credits, then the twin's directory", () => {
    const page = new JSDOM(renderCredits(CREDITS)).window.document;
    const twinLink = [...page.querySelectorAll("nav a")].find((a) => a.getAttribute("href") === "#assets-twin");
    expect(twinLink).toBeDefined();
    expect(page.getElementById((twinLink?.getAttribute("href") ?? "").slice(1))).not.toBeNull();
  });
});
