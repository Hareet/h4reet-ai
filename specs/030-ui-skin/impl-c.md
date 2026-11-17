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
