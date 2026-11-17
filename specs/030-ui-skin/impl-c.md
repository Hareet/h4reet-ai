# Notes: impl-030c (group C, the dark pages), night of 2026-11-17

Branch `night/impl-030c/impl-030c` from `7cdc31d2` (`spec-030`'s tip). Tasks T-C01 to T-C03 of [tasks.md](tasks.md), against plan §R-C1 to §R-C3.

## The pages, found from their routes

- The selection screen: `/` → `index.html` → `src/main.ts` → `src/room/app.ts:552-553` (`renderChoice` into `#app`) → `src/choice/choice.ts`, `src/choice/choice.css`. Its sheets in the bundle's order: `src/style.css` (main.ts), `src/room/room.css` (app.ts:59), then choice.ts's.
- The credits page: `/credits/` → `vite.config.ts:54` (`creditsPage`) → `build/credits.ts` (`STYLE`, `:22-28`; `generateBundle`, `:138-147`).
- The data-flow page: `/disclosure/` → `vite.config.ts:49` (`disclosurePage`) → `build/disclosure.ts` (`STYLE`, `:14-21`; `generateBundle`, `:137-143`).
- The tokens: `room.css:102-127` (`--glass`, `--hud-text`, `--hud-focus`, `--accent-neon`), `hud/split.css:16` (`--split-muted`).

## T-C01, RED

`test/ui/dark-pages.test.ts` (new) and two cases of spec 029's `test/ui/choice-cards.test.ts` rewritten. The colours are computed by a cascade over the stylesheets on the real DOM (`start()` for the selection screen; the renderers' HTML and the plugins' emitted `style.css` for the two pages), with var() resolved, B's `--btn-*` by their fallbacks, and again with a stand-in for B's `metal` (plan §R-B1's estimates).

### The earlier test rewritten (spec 029's `test/ui/choice-cards.test.ts`)

The spec's Assumptions name it ("`choice-cards.test.ts` where it pins a light colour"). Two cases, each pinning the light page's white ground:

1. "shows a chosen card by more than colour: a border at 3:1, a check mark, and the word 'Selected'".
   - Old: each `#rrggbb` in the chosen card's `border-color` and `box-shadow`, `onWhite(c) >= 3`.
   - New: the same values with their var()s resolved through `src/pages/dark.css`'s token rule (a token it doesn't hold, by its fallback), each `onGround(c) >= 3`, against the glass colour `rgb(16 20 26)`.
2. "keeps the radio behind its card focusable and in the accessibility tree, and rings the card on focus".
   - Old: the card's ring `/^(\d+)px\s+solid\s+(#rrggbb)$/` on the raw `outline`, `onWhite(colour) >= 3`.
   - New: the same pattern on the resolved `outline`, `onGround(colour) >= 3`.

`onWhite` became `luminanceOf` and `onGround`; `darkTokens` and `resolved` are new. No other case of the file changed. `test/ui/credits.test.ts` and `test/disclosure.test.ts` pin no colour of the light `STYLE` (they hold the emitted file's name, the single `<link>`, no `<style>`): unchanged.

### Seen failing, at `57c7e2ce` with the tests added (no code)

All 18 cases of `dark-pages.test.ts` fail but "makes Enter group B's primary button by its class…", which spec 029 already holds (a guard for B's selector, not a change). The two rewritten cases of `choice-cards.test.ts` fail on spec 029's `#0b4f9c` (2.30:1 on the glass); its other 24 pass.

```
$ cd apps/web && npx --no-install vitest run test/ui/dark-pages.test.ts test/ui/choice-cards.test.ts

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/impl-030c/apps/web

 ❯ test/ui/dark-pages.test.ts (18 tests | 17 failed) 20844ms
   ❯ the dark tokens (FR-015, Q9) (1)
     × holds dark.css's tokens equal to the room's own: room.css's and hud/split.css's :root 3ms
   ❯ the selection screen, dark (FR-015 to FR-018) (10)
     × puts dark-page on the body while it shows, and takes it off at Enter (the room has its own look) 20285ms
     × draws the cards from group B's tokens, each read with a fallback, so the screen holds without B's sheet 1ms
     × gives the screen the glass ground, white text, and every text at 4.5:1, without group B's sheet 57ms
     × underlines its links at 4.5:1 and rings every Tab stop at 3:1 over the dark ground, without group B's sheet 40ms
     × draws the steps, the cards, the outcome, and the chosen card's border at 3:1, without group B's sheet 36ms
     × gives the screen the glass ground, white text, and every text at 4.5:1, with a stand-in for B's metal skin 35ms
     × underlines its links at 4.5:1 and rings every Tab stop at 3:1 over the dark ground, with a stand-in for B's metal skin 32ms
     × draws the steps, the cards, the outcome, and the chosen card's border at 3:1, with a stand-in for B's metal skin 29ms
     × keeps the AI disclosure in view and dark: sticky, opaque on the glass, its words at 4.5:1, its rule at 3:1 13ms
   ❯ the credits and data-flow pages, dark (FR-015, FR-016) (7)
     × /credits/: its style.css starts with dark.css, then layout rules alone, no colour of their own 5ms
     × /credits/: dark-page on <html>, the glass ground, every text and link at 4.5:1, links underlined 67ms
     × /credits/: the focus ring at 3:1, the header's rule at 3:1, the disclosure at its top 68ms
     × /disclosure/: its style.css starts with dark.css, then layout rules alone, no colour of their own 3ms
     × /disclosure/: dark-page on <html>, the glass ground, every text and link at 4.5:1, links underlined 55ms
     × /disclosure/: the focus ring at 3:1, the header's rule at 3:1, the disclosure at its top 23ms
     × /disclosure/: the table's cells and header cells bordered at 3:1 31ms
 ❯ test/ui/choice-cards.test.ts (26 tests | 2 failed) 21345ms
   ❯ the cards' look (FR-028) (4)
     × shows a chosen card by more than colour: a border at 3:1, a check mark, and the word 'Selected' 4ms
     × keeps the radio behind its card focusable and in the accessibility tree, and rings the card on focus 12ms

⎯⎯⎯⎯⎯⎯ Failed Tests 19 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/ui/choice-cards.test.ts > the cards' look (FR-028) > shows a chosen card by more than colour: a border at 3:1, a check mark, and the word 'Selected'
AssertionError: #0b4f9c: expected 2.2978526161915043 to be greater than or equal to 3
 ❯ test/ui/choice-cards.test.ts:465:53
    463|     ]);
    464|     expect(colours.length).toBeGreaterThan(0);
    465|     for (const c of colours) expect(onGround(c), c).toBeGreaterThanOrE…
       |                                                     ^
    466|     // The mark and the word are hidden on an unchosen card, shown on …
    467|     for (const part of [".choice-check", ".choice-selected"]) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/19]⎯

 FAIL  test/ui/choice-cards.test.ts > the cards' look (FR-028) > keeps the radio behind its card focusable and in the accessibility tree, and rings the card on focus
AssertionError: expected 2.2978526161915043 to be greater than or equal to 3
 ❯ test/ui/choice-cards.test.ts:493:43
    491|     expect(m, "the card's focus ring").not.toBeNull();
    492|     expect(Number(m?.[1])).toBeGreaterThanOrEqual(2);
    493|     expect(onGround(m?.[2] ?? "#10141a")).toBeGreaterThanOrEqual(3);
       |                                           ^
    494|   });
    495|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the dark tokens (FR-015, Q9) > holds dark.css's tokens equal to the room's own: room.css's and hud/split.css's :root
AssertionError: dark.css's token rule: expected undefined to be defined
 ❯ test/ui/dark-pages.test.ts:328:43
    326|   it("holds dark.css's tokens equal to the room's own: room.css's and …
    327|     const rule = parseCss(darkCss()).rules.find((r) => list(r.selector…
    328|     expect(rule, "dark.css's token rule").toBeDefined();
       |                                           ^
    329|     expect(list(rule?.selector ?? "")).toContain(":root.dark-page");
    330|     const room = rootTokens("src/room/room.css");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > puts dark-page on the body while it shows, and takes it off at Enter (the room has its own look)
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/ui/dark-pages.test.ts:376:56
    374|     const v = start();
    375|     await flush();
    376|     expect(v.doc.body.classList.contains("dark-page")).toBe(true);
       |                                                        ^
    377|     expect(v.doc.documentElement.classList.contains("dark-page")).toBe…
    378|     await enter(v);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > draws the cards from group B's tokens, each read with a fallback, so the screen holds without B's sheet
AssertionError: --btn-frame: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/ui/dark-pages.test.ts:397:37
    395|     const names = new Set(reads.map((m) => m[1]));
    396|     for (const name of ["--btn-frame", "--btn-chamfer", "--btn-seconda…
    397|       expect(names.has(name), name).toBe(true);
       |                                     ^
    398|     for (const m of reads) expect(m[2], `${m[1]} without a fallback`).…
    399|     // No light colour of spec 029's left in the cards, the fieldsets,…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > gives the screen the glass ground, white text, and every text at 4.5:1, without group B's sheet
AssertionError: empty, rest, without group B's sheet: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:414:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > underlines its links at 4.5:1 and rings every Tab stop at 3:1 over the dark ground, without group B's sheet
AssertionError: empty, without group B's sheet: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:424:9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > draws the steps, the cards, the outcome, and the chosen card's border at 3:1, without group B's sheet
AssertionError: empty, rest, without group B's sheet: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:436:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > gives the screen the glass ground, white text, and every text at 4.5:1, with a stand-in for B's metal skin
AssertionError: empty, rest, with a stand-in for B's metal skin: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:414:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > underlines its links at 4.5:1 and rings every Tab stop at 3:1 over the dark ground, with a stand-in for B's metal skin
AssertionError: empty, with a stand-in for B's metal skin: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:424:9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > draws the steps, the cards, the outcome, and the chosen card's border at 3:1, with a stand-in for B's metal skin
AssertionError: empty, rest, with a stand-in for B's metal skin: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:436:11

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > keeps the AI disclosure in view and dark: sticky, opaque on the glass, its words at 4.5:1, its rule at 3:1
AssertionError: expected [ 255, 255, 255 ] to deeply equal [ 16, 20, 26 ]

- Expected
+ Received

  [
-   16,
-   20,
-   26,
+   255,
+   255,
+   255,
  ]

 ❯ test/ui/dark-pages.test.ts:454:21
    452|     const bg = c.background(header);
    453|     expect(bg?.a).toBe(1);
    454|     expect(bg?.rgb).toEqual([16, 20, 26]);
       |                     ^
    455|     const p = header.querySelector("p");
    456|     if (!p) throw new Error("no disclosure line");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /credits/: its style.css starts with dark.css, then layout rules alone, no colour of their own
 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /disclosure/: its style.css starts with dark.css, then layout rules alone, no colour of their own
AssertionError: dark.css: expected 0 to be greater than 0
 ❯ test/ui/dark-pages.test.ts:496:39
    494|       const css = page.css();
    495|       const dark = darkCss();
    496|       expect(dark.length, "dark.css").toBeGreaterThan(0);
       |                                       ^
    497|       expect(css.startsWith(dark), `${page.name}'s style.css starts wi…
    498|       const layout = css.slice(dark.length).replace(/\/\*[\s\S]*?\*\//…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /credits/: dark-page on <html>, the glass ground, every text and link at 4.5:1, links underlined
 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /disclosure/: dark-page on <html>, the glass ground, every text and link at 4.5:1, links underlined
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/ui/dark-pages.test.ts:505:67
    503|     it(`${page.name}: dark-page on <html>, the glass ground, every tex…
    504|       const doc = new JSDOM(page.html()).window.document;
    505|       expect(doc.documentElement.classList.contains("dark-page")).toBe…
       |                                                                   ^
    506|       const c = cascade([page.css()]);
    507|       ground(doc, c, page.name);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /credits/: the focus ring at 3:1, the header's rule at 3:1, the disclosure at its top
AssertionError: /credits/: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:515:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /disclosure/: the focus ring at 3:1, the header's rule at 3:1, the disclosure at its top
AssertionError: /disclosure/: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:515:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/19]⎯

 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /disclosure/: the table's cells and header cells bordered at 3:1
AssertionError: /disclosure/: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:528:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/19]⎯


 Test Files  2 failed (2)
      Tests  19 failed | 25 passed (44)
   Start at  03:51:32
   Duration  81.98s (tests 96%, transform 2%, import 2%)
```

Committed as `6a14fb2c`.

## T-C02, GREEN (`78dab4fb`, no test file in it)

- `src/pages/dark.css` (new): the five room tokens on `:root.dark-page, body.dark-page`, `color-scheme: dark`, the glass ground and white text; links `--accent-neon` underlined; focus rings `--hud-focus` (prefixed `body.dark-page` so they outrank `room.css`'s `.choice button:focus-visible` whatever the order); the disclosure on the glass with a `--split-muted` rule; tables' cells in `--page-rule` (`#8a8f98`).
- `src/choice/choice.ts`: imports `../pages/dark.css` before `./choice.css`; `dark-page` on the body from the render, removed on a submit that holds both choices, just before `onEnter`.
- `src/choice/choice.css`: every light colour replaced by a token; the cards' and the outcome's face `var(--btn-frame, #1f252d)`, corners `var(--btn-chamfer, 0.75rem)` with `corner-shape: bevel`, the chosen card's border, ring, and halo `var(--btn-secondary-selected-glow, var(--hud-focus))`; "Enter"'s look until B's sheet; the avatar previews on a `--split-muted` plate. No selector, state, media block, or layout of spec 029's changed.
- `build/disclosure.ts`: `DARK_CSS` and `pageStyle(layout)` (dark.css read at build, then the layout); `STYLE` without colours; `class="dark-page"` on `<html>`; the plugin watches `dark.css`. `build/credits.ts` the same, through those two.
- `plan.md` §R-C1: "As built", each departure from the plan's reading, in the same commit.

`npx --no-install vitest run test/ui/dark-pages.test.ts test/ui/choice-cards.test.ts` after the change: `Test Files 2 passed (2)`, `Tests 44 passed (44)`, exit 0. Then the tests covering the build files, exit 0: `Test Files 5 passed (5)`, `Tests 65 passed (65)` (`choice.test.ts`, `credits.test.ts`, `disclosure.test.ts`, `site.test.ts`, `smoke.test.ts`; the last two read the global setup's real release build, which built with the new plugins). Both runs are repeated in full below, at T-C03.

## T-C03, the tests beside C's, unchanged, and lint (at `a9a7931c`, the tree of `78dab4fb`)

The task's list (`choice-cards`, its "nothing before Enter" case included, `choice`, `a11y`, `loading-*`), C's own, and those covering C's build files (`credits`, `disclosure`, `site`, `smoke`). The reporter prints a file only when it fails, so the whole output is the summary:

```
$ cd apps/web && npx --no-install vitest run test/ui/dark-pages.test.ts test/ui/choice-cards.test.ts test/ui/choice.test.ts test/ui/a11y.test.ts test/ui/loading-a11y.test.ts test/ui/loading-degraded.test.ts test/ui/loading-faults.test.ts test/ui/loading-notes.test.ts test/ui/loading-page.test.ts test/ui/loading-style.test.ts test/ui/credits.test.ts test/disclosure.test.ts test/site.test.ts test/smoke.test.ts

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/impl-030c/apps/web


 Test Files  14 passed (14)
      Tests  233 passed (233)
   Start at  04:01:00
   Duration  191.23s (tests 75%, import 24%, transform 1%)

exit 0
```

```
$ make lint
node_modules/.bin/eslint --max-warnings 0 .
for ws in services/gateway services/relay apps/web; do node_modules/.bin/tsc --noEmit -p "$ws" || exit 1; done
node_modules/.bin/prettier --check .
Checking formatting...
All matched files use Prettier code style!
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
916 files already formatted
{ git ls-files -z '*.sh' 2>/dev/null || find . -name '*.sh' -not -path '*/node_modules/*' -printf '%P\0'; } | grep -zv '^\.specify/' | xargs -0 -t shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay
shellcheck -- .claude/git-hooks/pre-commit .claude/git-hooks/reference-transaction deploy/agents-engine/docker-relay .claude/hooks/_audit.sh .claude/hooks/bash-gate.sh .claude/hooks/content-scan.sh .claude/hooks/post-edit-check.sh .claude/hooks/protected-paths.sh .claude/hooks/subagent-report-check.sh deploy/agents-engine/bind-tree.sh deploy/agents-engine/engine.sh deploy/agents-engine/prove-limits.sh deploy/agents-engine/setup-host.sh deploy/edge/entrypoint.sh deploy/night-shift/container-probe.sh deploy/night-shift/images/entrypoint.sh deploy/night-shift/install.sh deploy/night-shift/probe.sh deploy/scripts/aws-login.sh deploy/scripts/aws-sso-profile.sh deploy/scripts/isolation-check.sh deploy/scripts/pull-models.sh deploy/scripts/redact.sh deploy/seaweedfs/entrypoint.sh deploy/tunnel/entrypoint.sh redteam/forbidden-actions.sh redteam/night-shift/run.sh tools/gates/install-tools.sh tools/gates/secrets.sh
exit 0
```

`make test` and `make evals` weren't run: the brief's rule 4 gives the whole suite to the integration (T-INT04's one `make check`), and C's tasks run their own files and lint. `make setup` ran first (`node_modules` was missing), exit 0.

## Findings for the integration and the reviewer

- **`a11y.test.ts` passes without testing the dark screen.** Its header case reads the last matching rule in the files' walk order (`src/pages/` before `src/room/`), so on the selection screen it reads `room.css`'s `.disclosure { background: #ffffff }`, which `dark.css`'s `.dark-page .disclosure` outranks; its focus case takes the first rule with a literal `#rrggbb` ring, `room.css`'s `#0b4f9c`, which `dark.css`'s `body.dark-page …:focus-visible` outranks (2.30:1 on the glass, were it the winner). The cascade's winners are held by `dark-pages.test.ts`. Not rewritten here (T-C03 says unchanged, and the spec's Assumptions don't list it for C); the page's Q asks for a rewrite in the integration.
- **B's token names.** The cards read `--btn-frame`, `--btn-chamfer`, `--btn-secondary-selected-glow`, plan §R-C1's names (B had no commit when C was built). `dark-pages.test.ts` runs every colour check again with a stand-in `:root[data-skin="metal"]` of plan §R-B1's estimates; at T-INT, with B's real sheet, those cases should use B's built stylesheet in its place.
- **"Enter" until B.** `.choice .choice-enter` (0,2,0) gives it a yellow primary face; B's rules, which name `:root[data-skin]` and the class, outrank it. T-INT02's probe should name any of these declarations B leaves dead.
- **The avatar previews** keep `avatars.ts`'s colours (shared with the 2D room, not C's file) on a light plate; their look is his (SC-008).

## Interruptions

None refused: no hook, bash-gate, or permission refusal. Every tracked file was written with Edit or Write; Prettier's wanted changes to the test file were read from `prettier <file> | diff` and made with Edit. No human-only path was touched and no patch for his hand is needed, so there is no SHA-256 to give. `resume/` isn't in this worktree (as the spec says); the screenshots weren't read.

## Questions

Four, in `/night/io/out/questions.md`, each with its recommended answer: the `a11y.test.ts` rewrite (recommended: in the integration, test-first); `corner-shape: bevel` for the chamfer (recommended: keep); "Enter"'s fallback look until B (recommended: keep, T-INT02 removes it if dead); B's three token names (recommended: B emits the plan's names).

## Done, and not

Done: T-C01 (RED, `6a14fb2c`), T-C02 (GREEN, `78dab4fb`, with plan §R-C1's "As built"), T-C03 (the 14 files, 233 tests, and `make lint`, above). The selection screen, `/credits/`, and `/disclosure/` are dark from `src/pages/dark.css`, at AA by the cascade, with "Enter" carrying `.choice-enter` and the cards reading B's tokens with fallbacks; spec 029's selection-screen tests pass, the two rewritten cases named above, and nothing is fetched before "Enter".

Not done, and not C's: B's real stylesheet over the cards (T-INT01, then this file's cases with B's sheet), the `a11y.test.ts` rewrite (the page's Q), the dead-declaration sweep (T-INT02), the one `make check` and the stack's merge-request note (T-INT04), and his look at the dark pages (SC-008). Not run here: `make test`, `make evals` (rule 4), the image stage (his gate).

# Rework: rework-030c, night of 2026-11-17

Branch `night/rework-030c/rework-030c` from `impl-030c`'s tip `20da89f3`. Built to `rework-spec-030`'s tip `2dd4213f` (`spec.md` FR-015, FR-016, the Edge Cases; `plan.md` §R-C1, §R-C2, §9's C row; `tasks.md` T-C01 to T-C03), and to `rv-030c`'s findings as the page's thirty-sixth wake records them, each recommended answer taken under his rule 1: R-1 (the first paint of `/` light), Q77 (R-2, the built pages' header scrolls away), R-5 (a hover face outside the tokens), R-7 (a redundant focus selector). The spec branch isn't merged in; this branch's `plan.md` is still `7cdc31d2`'s, so what `2dd4213f` changed in §R-C1 is written under its "As built", in the GREEN commit. I wrote none of C's review.

## T-C01 again, RED

### What changed in the tests

`test/ui/dark-pages.test.ts`:

1. **The case that asserted the opposite** (was `:373-381`), "puts dark-page on the body while it shows, and takes it off at Enter (the room has its own look)":
   - Old: after `start()`, `body.classList.contains("dark-page")` is `true` and `documentElement.classList.contains("dark-page")` is `false`; after "Enter", the body's is `false`.
   - New, "keeps dark-page on the root, not the body, while it shows, and takes it off at Enter (the room has its own look)": after `start()` (the helper loads the real `index.html`), the root's is `true` and the body's `false`; after "Enter", both `false`. T-C01's (b).
2. **New**, "carries dark-page on index.html's own `<html>`, so the first paint is dark before any script (rework N-4)": `index.html` parsed as the file holds it, the root's class `true`, the body's `false`. T-C01's (a).
3. **New**, "draws the no-script fallback dark: the glass ground, its words and links at 4.5:1, links underlined": `index.html` with no script run (the disclosure, the heading, the status line, the two links) under the selection screen's sheets in the bundle's order (Vite links them in the built page's `<head>`, so they apply without script): `ground`, `texts`, `links`. T-C01's (c).
4. **The token case**: dark.css's token rule found by `:root.dark-page` (was `body.dark-page`, with `:root.dark-page` asserted beside it), and no selector of dark.css keyed to `body.dark-page`.
5. **New, Q77**, for each of `/credits/` and `/disclosure/`, "keeps the header holding the AI disclosure in view as the page scrolls: sticky, opaque (Q77)": by the cascade's winner over the emitted `style.css`, the header's `position` is `sticky` and `top` `0`, its background the glass, opaque; and, so a focused control or an anchor scrolled into view stops below it (WCAG 2.4.11), the root's `scroll-padding-top` in rem is at least three lines of the disclosure (line-height 1.5) and its paragraph's two margins.

`test/ui/choice-cards.test.ts` (C's two cases of §R-C2; T-C01's (d), the helper's name):

- `onGround` (and `luminanceOf`, which `impl-030c` made of spec 029's `onWhite`) became `onWhite`, spec 029's own helper restored as it was, and `onDark` beside it, as §R-C2 names them. `onDark` reads each colour's luminance back from `onWhite` (`1.05 / ratio − 0.05`), so `onWhite` stays the one luminance formula and isn't left unused. The two rewritten cases call `onDark`; their assertions are otherwise unchanged from `impl-030c`'s (named above, under T-C01).
- `darkTokens()` finds the token rule by `:root.dark-page` (was `body.dark-page`), since the body half of that rule goes in GREEN; with the old lookup the cases would throw on `var(--hud-focus)`, which has no fallback.

These two changes don't fail at RED (today's token rule names both selectors), so the file passes here: they are renames that keep its two cases true after the re-key, not new checks.

### Seen failing, at `08fddb63` with the tests changed (no code)

```
$ cd apps/web && npx --no-install vitest run test/ui/dark-pages.test.ts test/ui/choice-cards.test.ts

 RUN  v5.0.3 /home/h4reet/h4reet-ai/night/2026-11-17/rework-030c/apps/web

 ❯ test/ui/dark-pages.test.ts (22 tests | 6 failed) 21939ms
   ❯ the dark tokens (FR-015, Q9) (1)
     × holds dark.css's tokens equal to the room's own: room.css's and hud/split.css's :root 5ms
   ❯ the selection screen, dark (FR-015 to FR-018) (12)
     × carries dark-page on index.html's own <html>, so the first paint is dark before any script (rework N-4) 63ms
     × keeps dark-page on the root, not the body, while it shows, and takes it off at Enter (the room has its own look) 18512ms
     × draws the no-script fallback dark: the glass ground, its words and links at 4.5:1, links underlined 63ms
   ❯ the credits and data-flow pages, dark (FR-015, FR-016) (9)
     × /credits/: keeps the header holding the AI disclosure in view as the page scrolls: sticky, opaque (Q77) 55ms
     × /disclosure/: keeps the header holding the AI disclosure in view as the page scrolls: sticky, opaque (Q77) 33ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/ui/dark-pages.test.ts > the dark tokens (FR-015, Q9) > holds dark.css's tokens equal to the room's own: room.css's and hud/split.css's :root
AssertionError: a dark.css selector keyed to the body's class: expected ':root.dark-page,\nbody.dark-page' not to match /body\.dark-page/

- Expected:
/body\.dark-page/

+ Received:
":root.dark-page,
body.dark-page"

 ❯ test/ui/dark-pages.test.ts:332:79
    330|     // rule of dark.css is keyed to the body's.
    331|     for (const r of parseCss(darkCss()).rules)
    332|       expect(r.selector, "a dark.css selector keyed to the body's clas…
       |                                                                               ^
    333|     const room = rootTokens("src/room/room.css");
    334|     const split = rootTokens("src/room/hud/split.css");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/6]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > carries dark-page on index.html's own <html>, so the first paint is dark before any script (rework N-4)
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/ui/dark-pages.test.ts:378:65
    376|   it("carries dark-page on index.html's own <html>, so the first paint…
    377|     const doc = new JSDOM(read("index.html")).window.document;
    378|     expect(doc.documentElement.classList.contains("dark-page")).toBe(t…
       |                                                                 ^
    379|     expect(doc.body.classList.contains("dark-page")).toBe(false);
    380|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/6]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > keeps dark-page on the root, not the body, while it shows, and takes it off at Enter (the room has its own look)
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ test/ui/dark-pages.test.ts:385:67
    383|     const v = start();
    384|     await flush();
    385|     expect(v.doc.documentElement.classList.contains("dark-page")).toBe…
       |                                                                   ^
    386|     expect(v.doc.body.classList.contains("dark-page")).toBe(false);
    387|     await enter(v);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/6]⎯

 FAIL  test/ui/dark-pages.test.ts > the selection screen, dark (FR-015 to FR-018) > draws the no-script fallback dark: the glass ground, its words and links at 4.5:1, links underlined
AssertionError: no script: the ground: expected null not to be null
 ❯ ground test/ui/dark-pages.test.ts:308:43
    306| function ground(doc: Document, c: Cascade, where: string): void {
    307|   const own = c.background(doc.body) ?? c.background(doc.documentEleme…
    308|   expect(own, `${where}: the ground`).not.toBeNull();
       |                                           ^
    309|   expect(own?.a, where).toBe(1);
    310|   expect(own?.rgb, where).toEqual([16, 20, 26]);
 ❯ test/ui/dark-pages.test.ts:399:5

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/6]⎯

 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /credits/: keeps the header holding the AI disclosure in view as the page scrolls: sticky, opaque (Q77)
AssertionError: /credits/'s header: expected null to be 'sticky' // Object.is equality

- Expected:
"sticky"

+ Received:
null

 ❯ test/ui/dark-pages.test.ts:549:70
    547|       const header = doc.querySelector("body > header");
    548|       if (!header) throw new Error(`${page.name}: no header`);
    549|       expect(c.value(header, ["position"]), `${page.name}'s header`).t…
       |                                                                      ^
    550|       expect(c.value(header, ["top"]), `${page.name}'s header`).toBe("…
    551|       const bg = c.background(header);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/6]⎯

 FAIL  test/ui/dark-pages.test.ts > the credits and data-flow pages, dark (FR-015, FR-016) > /disclosure/: keeps the header holding the AI disclosure in view as the page scrolls: sticky, opaque (Q77)
AssertionError: /disclosure/'s header: expected null to be 'sticky' // Object.is equality

- Expected:
"sticky"

+ Received:
null

 ❯ test/ui/dark-pages.test.ts:549:70
    547|       const header = doc.querySelector("body > header");
    548|       if (!header) throw new Error(`${page.name}: no header`);
    549|       expect(c.value(header, ["position"]), `${page.name}'s header`).t…
       |                                                                      ^
    550|       expect(c.value(header, ["top"]), `${page.name}'s header`).toBe("…
    551|       const bg = c.background(header);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯


 Test Files  1 failed | 1 passed (2)
      Tests  6 failed | 42 passed (48)
   Start at  04:29:41
   Duration  82.98s (tests 95%, transform 2%, import 2%)

exit 1
```

Each failure is the missing change: the body half of dark.css's token rule; the root's class in `index.html` (absent in the file, so absent under `start()`); the no-script fallback with no ground (style.css's light page); the built pages' header with no `position`. The ring cases pass at RED because the body still carries the class: they hold the re-key in GREEN (a focus rule left on `body.dark-page` would fall to room.css's `#0b4f9c`).
