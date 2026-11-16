# Probe B0: why no answer shows in the conversation panel (spec 029, group B)

Night 2026-11-16, task `probe-chat-029` (implementer, probe only), from `f411d8e1`. A note, not a spec: no code or test
changes in the repository. The scratch harnesses lived under `/tmp/probe029/`; their full text is at the end.

The Author's words, from his review of `feat/028-room-after-review-p` (2026-11-15):

> 2) We seem to have broken the conversation chat, let's ensure we test it, from the latest screenshot in resume/ you
> can see that we can't see the chat output in the box below the input text field of "your message"

`feat/028-room-after-review-p` is `f411d8e1`, the tip he ran (`git branch -a`: `feat/028-room-after-review-p f411d8e1`).

## The answer, first

Two separate faults, and one display that isn't a fault. His stack isn't needed to explain the screenshot.

1. **On `f411d8e1`, no turn can leave the page. Cause: content, not code.** `f411d8e1` ("corpus: 022, 026 r4, 028 P1,
   regenerated") regenerated `config/twin/corpus.json`. All three topics' pack hashes changed, but
   `config/twin-readiness.yaml` still holds the old ones. The build's readiness rule
   (`apps/web/build/room/readiness.ts:116-131`) closes a topic whose hash doesn't match, so every topic is closed.
   `free_talk` is `{ ready: false }` on both commits (`config/twin-readiness.yaml:51`). So on `f411d8e1`:
   - typed text with no piece selected shows `cannot_talk.unavailable`, sends no request, and leaves the words in
     the box (`apps/web/src/talk/talk.ts:367-371`);
   - a piece selected shows `topic_not_ready` and sends nothing (`talk.ts:484-487`).

   This matches his screenshot: the field still holds "What is this". Readiness closing on a hash change is spec 007's
   rule working as designed (FR-030; the readiness file's own comment: "a change to either hash closes the topic
   until the Author re-runs his evaluations and marks the new hashes"). The fix is his, not code: see Q-B0-1.
2. **In the split layout, the log has no height, so every line in it is out of sight. Cause: CSS, made visible by
   spec 028.** The panel's code runs correctly on both commits. The answer, the degraded text, and the error text are
   all appended to `#talk-log`, with no `hidden`, no `inert`, and no `visually-hidden` (harness output below). The
   problem is how the open panel's grid lays the lines out:
   - `split.css:273` (`.talk[data-panel="open"] > * { position: relative }`, specificity 0,4,1, from spec 018's
     `bbe6c98f`) outranks `.split-frame { position: absolute }` (`split.css:357`, 0,3,1) and room.css's
     `.visually-hidden` (0,1,0). So the frame SVG (`split.ts:264`, `talk.prepend(frame)`) and the panel's `h2` are
     in-flow grid items with no grid row.
   - Auto-placement puts them in implicit rows after the form (row 5).
   - The frame's viewBox is `0 0 {panel w} {panel h − title h}`, at `width: 100%`. In an auto row its percentage
     height counts as auto, so its height comes from the viewBox ratio.
   - On `f411d8e1`, spec 028's `055ec7fc` made the panel one column (`split.css:266`, `minmax(0, 1fr)`) and always
     open (`split.ts:289`). So the frame is the panel's full width, and its height is the panel's height minus the
     title (at 1920×1080: viewBox `0 0 320 736` in a 780 px panel). That is more than the grid has left once the
     title, stats, and form take theirs, so the log's `minmax(0, 1fr)` row gets 0 px.
   - The frame's glass sits below the form, empty. That empty frame is "the box below the input text field".

   On `a36f98ec` the same misplacement held, but the open panel was two columns (`2fr 1fr`, 640 px wide). The frame
   in column 1 got about 2/3 of the panel's height, which left the log roughly 100–150 px (estimate below), so lines
   showed. This part is by the CSS sizing rules: no layout engine runs here. The DevTools snippet below confirms it
   in his browser in one paste.
3. **"SERVING Unknown" is expected on every build of both commits, whatever his stack does.**
   `apps/web/room/scene.yaml:25` is `live: { source: off, … turn: site }`. `reduceTier` returns `not-live` when
   `live === "off"` (`apps/web/src/room/signals/tier.ts:83`). `statsFrom` maps every tier outside
   local/cloud/resting/budget/unavailable to the key `unknown` (`apps/web/src/room/hud/stats.ts:15,21`), and the UI
   word `stat.tier.unknown` is "Unknown" (`apps/web/room/ui-words.yaml:106`). Nothing polls `/api/status`
   while `source` is off (`apps/web/src/room/signals/live.ts:11`). "SERVING Unknown" says nothing about his gateway, so "THIS CALL no call yet" and
   "THIS VISIT $0" agree with fault 1: no turn went out.

## 1. What the panel and the room do (read)

`git diff --stat a36f98ec f411d8e1 -- apps/web/src` (no file in `talk/` changes):

```
 apps/web/src/room/app.ts                      |  94 ++++----
 apps/web/src/room/bubble.css                  |  50 ++++
 apps/web/src/room/bubble.ts                   |  87 +++++++
 apps/web/src/room/compose/hud.ts              | 229 ++++++++++++-------
 apps/web/src/room/hud/split.css               | 300 ++++++++++++------------
 apps/web/src/room/hud/split.ts                |  97 +++-----
 apps/web/src/room/layout.ts                   | 112 ++++-----
 …
 26 files changed, 1431 insertions(+), 512 deletions(-)
```

What each changed file does to the conversation, read from the diff:

- `room/app.ts`: the stage's notes go; a dog visitor's introduction is said once (`introduceDogVisitor`, announcer
  and the 3D bubble, "No turn: nothing in the conversation's log or history, no request"); the portrait fetch goes.
  Nothing touches `renderTalk`'s options, `sendTurn`, `onTurnOutcome`, or the log.
- `room/bubble.ts`: a `div.room-bubble`, `aria-hidden`, in the stage's host. It shows the dino call and the dog
  intro, never a turn's answer. It doesn't take the answer.
- `room/layout.ts`: `--split-*` becomes `--wall-*`; the notes' box is empty.
- `room/hud/split.ts`: `data-panel` is always `"open"` in the split layout (`split.ts:289`), and the parts (the hint,
  `split-top`, and the frame SVG `talk.prepend(frame)`, `split.ts:264`) are built at once, not on a conversation's
  start. There is no rest row (`bar`) any more.
- `room/hud/split.css`: the open panel is one column (`split.css:266`) at the wall box (`--wall-panel-*`); the rest
  row's rules are gone; `> * { position: relative }` (`split.css:273`) is unchanged since spec 018.

## 2. The send path, on exports of both commits

Exports: `git archive <commit> | tar -x -C /tmp/probe029/<c>`, each with the worktree's `node_modules` linked in
(`npm ci --ignore-scripts` in the worktree first). The harness, `test/probe/probe.test.ts`, mounts the whole room as
`main.ts` does: `startRoom` through `test/helpers/room.ts`'s `start()`, with the real `renderTalk` and the real
`createTurnSender` (`main.ts:35`). It fakes only `fetch`, at the network boundary. Each run walks the arrival
(choice, loader, hand-off, "Keep it for later"), types "What is this", submits the form, then puts `room.css`,
`talk.css`, `split.css`, and `bubble.css` into the document so jsdom's cascade computes each part's style. Windows:
1920×1080 and 1280×720 (stubbed viewport), plus 800×600. Replies: 200 `{text}`, 503 `{state: "degraded", cause:
"local_unhealthy"}`, a network failure, 500.

Whether jsdom's cascade honours specificity (it does; source order alone would give `absolute` to both):

```
$ node cascade-check.mjs
vh relative
f relative
```

### 2a. With the fixture's readiness (nothing ready, as `roomContent()` gives it), both commits

```
$ cd /tmp/probe029/f411/apps/web && PROBE_OUT=/tmp/probe029/f411.txt npx vitest run --maxWorkers=4 --config vitest.probe.config.ts
      Tests  12 passed (12)
screen 1920x1080 reply=answer: data-hud=column data-split=on before-send data-panel=open after-send data-panel=open data-log=lines
  fetch calls: []
  status="" box="What is this"
  log lines: ["cannot_talk.unavailable: The twin can't talk right now. The service is unavailable. Read the resume Download the resume (PDF)"]
```

`a36f98ec` gives the same four lines in all 12 cases (`fetch calls: []`, the words left in the box,
`cannot_talk.unavailable`). Free talk closed means typed text never sends, on either commit. This is how his room
behaves on `f411d8e1` with or without a piece, since every topic is closed there (§3).

### 2b. Free talk marked ready (as `talk-turns.test.ts`'s `room({ freeTalk: true })` does), both commits

The `a36f98ec` and `f411d8e1` runs give the same lines in every case:

```
$ cd /tmp/probe029/<c>/apps/web && PROBE_OUT=/tmp/probe029/<c>.free.txt npx vitest run --maxWorkers=4 --config vitest.probe.config.ts
      Tests  12 passed (12)            # each commit
screen 1920x1080 reply=answer:   fetch calls: ["POST /api/room/turn"]  box=""             log lines: ["visitor: You: What is this","twin: AI twin: PROBE-ANSWER: the twin's words."]
screen 1920x1080 reply=degraded: fetch calls: ["POST /api/room/turn"]  box="What is this" log lines: ["visitor: You: What is this","cannot_talk.resting: The twin can't talk right now. The local tier, the computer it runs on, is resting. Read the resume Download the resume (PDF)"]
screen 1920x1080 reply=network:  fetch calls: ["POST /api/room/turn"]  box="What is this" log lines: ["visitor: You: What is this","cannot_talk.unavailable: The twin can't talk right now. The service is unavailable. …"]
screen 1920x1080 reply=500:      fetch calls: ["POST /api/room/turn"]  box="What is this" log lines: ["visitor: You: What is this","cannot_talk.unavailable: …"]
(1280x720 and 800x600: the same lines; data-split=off there on both commits)
```

(Lines condensed from the harness output: one per case, the header's layout fields dropped.)

The split panel's grid after an answer, `f411d8e1`, 1920×1080:

```
screen 1920x1080 reply=answer: data-hud=column data-split=on before-send data-panel=open after-send data-panel=open data-log=lines
  log: class="talk-log" hidden=false hiddenAncestor=false inert=false overflow-y=auto position=static display=block grid-row=3
  wall vars: panel-h=780px panel-w=320px title-h=44px split-frame-h=
  .talk: position=absolute display=grid grid-row=auto grid-template-rows=var(--wall-title-h) auto minmax(0, 1fr) auto auto grid-template-columns=minmax(0, 1fr)
  .talk's children, in order (display:contents expanded):
    svg.split-frame: position=relative display=inline grid-row=auto viewBox="0 0 320 736" preserveAspectRatio=none width=100% height=calc(100% - var(--wall-title-h))
    h2#talk-heading.visually-hidden: position=relative display=block grid-row=auto
    div.talk-sheet: position=relative display=contents grid-row=auto
    div.talk-head: position=static display=flex grid-row=1
    div.split-top: position=static display=flex grid-row=2
    div#talk-log.talk-log: position=static display=block grid-row=3
    p.talk-status: position=static display=block grid-row=4
    form.talk-form: position=relative display=grid grid-row=5
```

`a36f98ec`, 1920×1080 (the panel opened by the line, from `bar`):

```
screen 1920x1080 reply=answer: data-hud=column data-split=on before-send data-panel=bar after-send data-panel=open data-log=lines
  log: class="talk-log" hidden=false hiddenAncestor=false inert=false overflow-y=auto position=static display=block grid-row=3
  wall vars: panel-h= panel-w= title-h= split-frame-h=970.5px
  .talk: position=absolute display=grid grid-row=auto grid-template-rows=var(--split-title-h) auto minmax(0, 1fr) auto auto grid-template-columns=2fr 1fr
  .talk's children, in order (display:contents expanded):
    svg.split-frame: position=relative display=inline grid-row=auto viewBox="0 0 640 926.5" preserveAspectRatio=none width=100% height=calc(100% - var(--split-title-h))
    h2#talk-heading.visually-hidden: position=relative display=block grid-row=auto
    …                                 (talk-head 1, split-top 2, talk-log 3, talk-status 4, talk-form 5, as on f411)
    div.split-portrait: position=relative display=block grid-row=2 / 5
```

1280×720, `f411d8e1`: `data-split=off`. The column layout's `.talk` is a flex box, the `h2` is `position=absolute`, the
sheet and form are static, and the log is shown. The split layout and its stats ("SERVING …") appear only where
`data-split=on`, so his screenshot was taken in the split layout.

### Where the text lands

| | `a36f98ec` | `f411d8e1` |
|---|---|---|
| Turn sent? (his readiness) | yes for the three topics; typed text without a piece: no (free talk closed) | **no**: every topic closed, free talk closed (§3) |
| Answer / degraded / error text appended to `#talk-log`? | yes, all three | yes, all three |
| Hidden by an attribute, `display`, `inert`, `visually-hidden`, or the bubble? | no | no |
| Split layout: log's grid row height | ≈100–150 px at 1920×1080 (estimate, below): **shown**, though over the bare scene, the frame's glass being below the form | **0 px** at every window (the frame's ratio takes the panel's height): **appended but hidden** (height, `overflow-y: auto`, by the grid) |
| Column layout (1280×720, 800×600) | shown | shown |

The estimate, from the CSS and the wall vars above (no layout engine here):
- `a36f98ec`: the frame in column 1 is 2/3 × 640 = 426.7 px wide, so its ratio height is 426.7 × 926.5/640 ≈ 618 px.
  The panel is 970.5 px. The log gets 970.5 − 44 (title) − 618 − ≈60 (stats) − ≈80 (form) − 24 (six 0.25rem gaps)
  − status ≈ 100–150 px.
- `f411d8e1`: the frame is 320 px wide, so its ratio height is 320 × 736/320 = 736 px, in a 780 px panel. 780 − 44 −
  736 < 0 before the stats and the form, so `minmax(0, 1fr)` is 0. The same holds at every scale, since the viewBox is
  always the panel's own box.

One assumption, to confirm in a browser: the frame's height comes from its viewBox ratio even with
`preserveAspectRatio="none"`. If his browser gave it the 150 px default instead, the log would have room on
`f411d8e1`, and the empty box would need another explanation. The snippet below settles it.

## 3. Which change broke it

Bisect wasn't run. The DOM path gives the same result on both ends (§2b), so jsdom has no good/bad signal to
bisect on. The layout signal needs a browser. The readiness has a single candidate by `git log`:

```
$ git log --format='%h %ad %s' --date=short a36f98ec..f411d8e1 -- config/twin/corpus.json config/twin/prompt.md config/twin/lines.yaml config/twin-readiness.yaml
f411d8e1 2026-11-15 corpus: 022, 026 r4, 028 P1, regenerated

$ node --import tsx /tmp/probe029/harness/readiness.mts /tmp/probe029/<c>     # the build's own twinReadiness over each export
a36f: {"freeTalk":false,"topics":{"hobbies-and-travel":true,"mission":true,"work-projects":true}}
f411: {"freeTalk":false,"topics":{"hobbies-and-travel":false,"mission":false,"work-projects":false}}

$ python3 -I - <<'EOF'      # each topic's pack hash in config/twin/corpus.json beside config/twin-readiness.yaml's, from git objects
…
EOF
a36f98ec | hobbies-and-travel: tree 777124e14926 file 777124e14926 SAME ; mission: tree 73e824b757b0 file 73e824b757b0 SAME ; work-projects: tree 2eafbdb4f4f2 file 2eafbdb4f4f2 SAME
f411d8e1 | hobbies-and-travel: tree d574f1fa248e file 777124e14926 DIFFERENT ; mission: tree c028c92d9303 file 73e824b757b0 DIFFERENT ; work-projects: tree 6fdd269b9dd0 file 2eafbdb4f4f2 DIFFERENT
a556a933 | hobbies-and-travel: tree 777124e14926 file 777124e14926 SAME ; mission: tree 73e824b757b0 file 73e824b757b0 SAME ; work-projects: tree 2eafbdb4f4f2 file 2eafbdb4f4f2 SAME
```

(`a556a933` is main's tip tonight; `f411d8e1` isn't on it yet.)

- **Readiness (no turn goes out):** `f411d8e1`, `config/twin/corpus.json` regenerated without re-marking
  `config/twin-readiness.yaml` (topic hashes at its `hobbies-and-travel:`, `mission:`, and `work-projects:` entries;
  `free_talk` at line 51). This commit is authored by the Author (`author=Hareet`, Sun Nov 15 20:38:47 2026 -0700),
  and both files are his.
- **Layout (lines out of sight):** `055ec7fc` feat(028): T-A03, "the panel without its thumbnail, standing open beside
  the room's left wall". It made the open grid one column (`apps/web/src/room/hud/split.css:266`) and the panel
  always open (`apps/web/src/room/hud/split.ts:289`). That turned spec 018's latent misplacement into a 0 px log.
  The latent defect is older: `bbe6c98f` feat(018): T011 T012 (`split.css:273`, the `> *` rule that pulls the frame
  and the `h2` into the flow) with `d4e0b83d` feat(018): T008 T009 (`split.ts:264`, the frame prepended into the
  grid).

```
$ git log --format='%h %ad %s' --date=short -S'.talk[data-panel="open"] > *' -- apps/web/src/room/hud/split.css
bbe6c98f 2026-11-14 feat(018): T011 T012 the list, split.css (plan.md D-I3)
$ git log --format='%h %ad %s' --date=short -S'talk.prepend(frame)' -- apps/web/src/room/hud/split.ts
d4e0b83d 2026-11-14 feat(018): T008 T009 the panel in the split layout (plan.md D-I2)
$ git show 055ec7fc -- apps/web/src/room/hud/split.css | grep -n "grid-template-columns"
268:-  grid-template-columns: 2fr 1fr;
270:+  grid-template-columns: minmax(0, 1fr);
$ git show 055ec7fc -- apps/web/src/room/hud/split.ts | grep -n "^[-+].*data-panel"
171:-      talk.setAttribute("data-panel", open ? "open" : "bar");
174:+      talk.setAttribute("data-panel", "open");
```

## 4. His stack: not needed for the diagnosis

The screenshot is explained without his gateway. No turn could go out on `f411d8e1` (build-time readiness), and
"SERVING Unknown" is `live.source: off`. Whatever line the panel showed landed in a 0 px log. Nothing here needs a
container, the GPU, or Bedrock, so there is no ops batch.

One confirmation does need his browser: the layout. A read-only DevTools console snippet, nothing secret. It reports
boxes and computed styles only, never the log's words. Run it in the split layout (a wide window) after sending
anything, so the log holds a line:

```js
// Paste in the room's DevTools console (Console tab) after one send in a wide window. It reads, never writes.
(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), position: c.position, gridRow: c.gridRow }; };
  const root = document.documentElement;
  return JSON.stringify({
    ua: navigator.userAgent.replace(/\s+/g, " "), viewport: [innerWidth, innerHeight],
    split: root.dataset.split, hud: root.dataset.hud,
    panel: q("section.talk")?.dataset.panel, logLines: q("#talk-log")?.childElementCount,
    talk: box(q("section.talk")), frame: box(q("section.talk > svg.split-frame")),
    frameViewBox: q("section.talk > svg.split-frame")?.getAttribute("viewBox"),
    heading: box(q("#talk-heading")), top: box(q(".split-top")), log: box(q("#talk-log")),
    status: box(q(".talk-status")), form: box(q(".talk-form")),
  }, null, 1);
})();
```

What it settles: `log.h` 0 (or near it) with `frame.y` greater than `form.y` confirms §2 and the fix below. A log with
height whose lines still don't show would point elsewhere, and a follow-up would look at it.

## 5. Recommended fix and the test he asked for

**Content (his, not code):** re-run his evaluations and the red-team on `f411d8e1`'s regenerated pack, then mark the
three new pack hashes in `config/twin-readiness.yaml` (Q-B0-1). Until then the room is right to send nothing. A
spec-029 FR could make that visible to him rather than silent:
- the build's report prints "0 of 3 topics ready: pack hash changed";
- typed text with free talk closed shows a message pointing to the pieces, not "The service is unavailable"
  (Q-B0-3).

**Code (B's fix task, test-first):** take the frame and the visually hidden heading out of the open panel's flow.
Narrow `split.css:273` to the panel's real rows:

```css
html[data-split="on"][data-hud="column"] .talk[data-panel="open"] > :not(.split-frame, .visually-hidden) { … }
```

`:not()` takes its argument's specificity, so the rule keeps 0,4,1 against everything else. The frame then takes its
own `position: absolute; top: var(--wall-title-h)` (`split.css:357-367`) and covers the body behind the log. Give the
log row the glass's legibility the frame already provides (FR-014's 4.5:1 is then met by the frame, as spec 018
meant). Spec 018's FR-005 order stays: stats, the body (the log), then the text box row at the foot. So the answer
shows **above** "Your message", inside the frame. The "box below" was the frame out of place (Q-B0-2 asks him to
confirm).

**The DOM test he asked for** (new file, e.g. `apps/web/test/ui/talk-split-answer.test.ts`), through the real panel:
- Mount the room with `start()` in a split window (`stubViewport({ w: 1920, h: 1080 })`) with free talk ready, or a
  ready piece selected. Give it the real `createTurnSender` with only `fetch` faked, as the harness does.
- Type into the box labelled "Your message", submit, and assert the answer's text in `[role="log"]` under "AI twin".
  The same for the 503 degraded body (`cannot_talk.resting`'s text) and a network failure
  (`cannot_talk.unavailable`'s), each with the words given back to the box.
- Visibility, as far as jsdom can see it: put the four stylesheets in the document (the harness's way; vitest loads
  CSS imports as empty) and assert:
  - every child of the open `.talk` that the grid would place without a row of its own (`grid-row` auto) is out of
    flow (`position` absolute or fixed);
  - `#talk-log`'s computed `grid-row` comes before `.talk-form`'s;
  - the log is not `display: none`, has no `[hidden]` or `[inert]` ancestor, and has no `visually-hidden` in effect.

  The first assertion is the one that is **RED on `f411d8e1`** (`svg.split-frame` and `h2#talk-heading` are
  `relative`, §2b) and GREEN after the fix. The append assertions are GREEN today on both commits. They guard the
  send path; they don't reproduce this bug.
- What jsdom can't see: a track's height. The 0 px row is layout, so only a browser proves "the answer's text is on
  screen".

**A real-browser test, if wanted (not tonight; no download):**
- **Tool:** Playwright with a Chromium pinned in the devcontainer image (`.devcontainer/`, the Author's change; the
  sandbox's network rule for its download is his too).
- **What it needs on the page:**
  - a build whose index has free talk or a piece ready. Readiness is computed at build from the tree
    (`virtual:room-content`), so it needs a test-build input that marks readiness, refused in a release build like
    the drafts flag;
  - the turn route faked by `page.route("/api/room/turn", …)`, the same network boundary, so no model call;
  - the hooks the page already has: `role="log"`, `#talk-text`, its "Your message" label, and the "Enter" and "Keep
    it for later" buttons.

  Nothing new is needed in the markup.
- **What it would assert:** the answer's text node has a client rect inside both the log's rect and the viewport,
  with non-zero height, at 1920×1080 and at the smallest split window.

## Questions for the Author (also in `/night/io/out/questions.md`)

- **Q-B0-1:** re-mark readiness for `f411d8e1`'s regenerated pack? Recommended: re-run `make evals` and
  `make redteam` (local and Anthropic, as the current evidence) on it, then mark the three new pack hashes.
- **Q-B0-2:** the answer above "Your message", inside the frame (spec 018's FR-005 order)? Recommended: yes.
- **Q-B0-3:** a fixed message, in his words, for typed text while free talk is closed? Recommended: yes.
- **Q-B0-4:** a real-browser test later? Recommended: after 029's DOM test, in its own spec.

## Refusals

None: no hook or bash-gate refused a command tonight.

## Verification

The branch adds this note alone; no code, test, or config changed. So `make lint` was run and `make test` and
`make evals` were not: they test nothing this commit touches. The first `make lint` failed (exit 2) on ruff's format
of the Python block above; after `ruff format -- specs/029-room-polish/probe-chat.md`:

```
$ make lint
…
ruff check .
All checks passed!
ruff format --check --no-cache --extend-exclude corpus .
872 files already formatted
…
make lint exit 0
```

## The scratch harness (under `/tmp/probe029/`, not committed)

`vitest.probe.config.ts` is `apps/web/vitest.config.ts` with `include: ["test/probe/**/*.test.ts"]` and without
`globalSetup` (the site's build isn't needed):

```
$ diff apps/web/vitest.config.ts /tmp/probe029/harness/vitest.probe.config.ts
14c14
<     include: ["test/**/*.test.ts"],
---
>     include: ["test/probe/**/*.test.ts"],
18d17
<     globalSetup: ["test/global-build.ts"],
```

`test/probe/probe.test.ts` (the §2b version; §2a is the same without the `content` override):

```ts
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it } from "vitest";

import type { RoomIndex } from "../../src/room/compose/bundle";
import { createTurnSender } from "../../src/talk/turn-client";
import { enter, flush, roomContent, roomIndex, start, stubViewport, throughLoader } from "../helpers/room";

const ready = (): RoomIndex => {
  const index = roomIndex();
  return { ...index, live: { ...index.live, turn: "site" }, topics: index.topics.map((t) => ({ ...t, ready: true })) };
};

type Reply = "answer" | "degraded" | "network" | "500";
const ANSWER = "PROBE-ANSWER: the twin's words.";

function fakeFetch(reply: Reply, calls: string[]) {
  return (url: string, init: RequestInit): Promise<Response> => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    if (reply === "network") return Promise.reject(new TypeError("Failed to fetch"));
    const [status, body] =
      reply === "answer"
        ? [200, { text: ANSWER }]
        : reply === "degraded"
          ? [503, { state: "degraded", cause: "local_unhealthy" }]
          : [500, { error: "internal" }];
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
  };
}

const css = (rel: string): string => { try { return readFileSync(fileURLToPath(new URL(`../../src/${rel}`, import.meta.url)), "utf8"); } catch { return ""; } };
const SHEETS = ["room/room.css", "talk/talk.css", "room/hud/split.css", "room/bubble.css"];

async function probe(screen: { w: number; h: number }, reply: Reply): Promise<string> {
  const viewport = stubViewport(screen);
  const calls: string[] = [];
  let sender: ReturnType<typeof createTurnSender> | null = null;
  const content = roomContent();
  const v = start({
    content: { ...content, manifest: { ...content.manifest, free_talk: { ready: true } } },
    room: ready(),
    viewport: viewport.factory,
    sendTurn: (req, ended, signal) => sender?.(req, ended, signal),
  });
  sender = createTurnSender({ fetch: fakeFetch(reply, calls), clock: v.clock });
  await enter(v, "engineer");
  await throughLoader(v);
  v.clock.advance(5000);
  [...v.doc.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Keep it for later")?.click();
  await flush();
  const doc = v.doc;
  const root = doc.documentElement;
  const talk = doc.querySelector<HTMLElement>("section.talk");
  const box = doc.querySelector<HTMLInputElement>("#talk-text");
  const log = doc.querySelector<HTMLElement>("#talk-log");
  if (!talk || !box || !log) throw new Error("no panel");
  const before = `data-panel=${talk.getAttribute("data-panel")}`;
  box.value = "What is this";
  box.dispatchEvent(new v.win.Event("input", { bubbles: true }));
  box.form?.requestSubmit();
  for (let i = 0; i < 4; i += 1) await flush();
  for (const s of SHEETS) {
    const style = doc.createElement("style");
    style.textContent = css(s);
    doc.head.append(style);
  }
  const cs = (el: Element) => v.win.getComputedStyle(el);
  const at = (el: Element): string => {
    const c = cs(el);
    return `position=${c.position} display=${c.display} grid-row=${c.getPropertyValue("grid-row") || c.getPropertyValue("grid-row-start") || "?"}`;
  };
  const name = (el: Element): string =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].join(".")}`;
  const lines: string[] = [];
  lines.push(
    `screen ${screen.w}x${screen.h} reply=${reply}: data-hud=${root.getAttribute("data-hud")} data-split=${root.getAttribute("data-split")} before-send ${before} after-send data-panel=${talk.getAttribute("data-panel")} data-log=${talk.getAttribute("data-log")}`,
  );
  lines.push(`  fetch calls: ${JSON.stringify(calls)}`);
  lines.push(`  status="${doc.querySelector(".talk-status")?.textContent}" box="${box.value}"`);
  lines.push(
    `  log lines: ${JSON.stringify([...log.children].map((c) => `${c.getAttribute("data-speaker") ?? c.getAttribute("data-message")}: ${c.textContent}`))}`,
  );
  lines.push(
    `  log: class="${log.className}" hidden=${log.hidden} hiddenAncestor=${log.closest("[hidden]") !== null} inert=${log.closest("[inert]") !== null} overflow-y=${cs(log).overflowY} ${at(log)}`,
  );
  lines.push(`  wall vars: panel-h=${root.style.getPropertyValue("--wall-panel-h")} panel-w=${root.style.getPropertyValue("--wall-panel-w")} title-h=${root.style.getPropertyValue("--wall-title-h")} split-frame-h=${root.style.getPropertyValue("--split-frame-h")}`);
  lines.push(`  .talk: ${at(talk)} grid-template-rows=${cs(talk).getPropertyValue("grid-template-rows")} grid-template-columns=${cs(talk).getPropertyValue("grid-template-columns")}`);
  lines.push("  .talk's children, in order (display:contents expanded):");
  const items = (el: Element): Element[] =>
    [...el.children].flatMap((c) => (cs(c).display === "contents" ? [c, ...items(c)] : [c]));
  for (const c of items(talk)) {
    const extra = c.tagName.toLowerCase() === "svg" ? ` viewBox="${c.getAttribute("viewBox")}" preserveAspectRatio=${c.getAttribute("preserveAspectRatio")} width=${cs(c).width} height=${cs(c).height}` : "";
    lines.push(`    ${name(c)}${(c as HTMLElement).hidden ? " [hidden]" : ""}: ${at(c)}${extra}`);
  }
  return lines.join("\n");
}

describe("B0 probe", () => {
  for (const screen of [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 800, h: 600 }])
    for (const reply of ["answer", "degraded", "network", "500"] as Reply[])
      it(`${screen.w}x${screen.h} ${reply}`, async () => {
        appendFileSync(process.env.PROBE_OUT ?? "/tmp/probe029/out.txt", `${await probe(screen, reply)}\n\n`);
      });
});
```

`readiness.mts` (run with `node --import tsx` from each export's `apps/web`):

```ts
const [root] = process.argv.slice(2);
const { fileTree } = await import(`${root}/apps/web/build/room/source.ts`);
const { twinReadiness } = await import(`${root}/apps/web/build/room/readiness.ts`);
const r = twinReadiness(fileTree(root));
console.log(JSON.stringify({ freeTalk: r.freeTalk, topics: Object.fromEntries(r.topics) }));
```

The hash comparison (`python3 -I`, reading git objects only):

```python
import json, re, subprocess

for c in ["a36f98ec", "f411d8e1", "a556a933"]:
    pack = json.loads(
        subprocess.run(
            ["git", "show", f"{c}:config/twin/corpus.json"],
            capture_output=True,
            text=True,
        ).stdout
    )
    y = subprocess.run(
        ["git", "show", f"{c}:config/twin-readiness.yaml"],
        capture_output=True,
        text=True,
    ).stdout
    out = []
    for t in pack.get("topics", []):
        m = re.search(
            r"\n  %s:\n    ready: (\w+)\n    pack_sha256: (\w+)" % re.escape(t["id"]), y
        )
        out.append(
            f"{t['id']}: tree {t['sha256'][:12]} file {m.group(2)[:12] if m else None} {'SAME' if m and m.group(2) == t['sha256'] else 'DIFFERENT'}"
        )
    print(c, "|", " ; ".join(out))
```

`cascade-check.mjs` (jsdom's cascade and specificity):

```js
import { JSDOM } from "jsdom";
const dom = new JSDOM(`<style>
html[a="1"][b="1"] .t[p="o"] > * { position: relative; }
.vh { position: absolute; }
html[a="1"][b="1"] .f { position: absolute; }
</style><div class="t" p="o"><i class="vh"></i><i class="f"></i></div>`);
const d = dom.window.document; d.documentElement.setAttribute("a","1"); d.documentElement.setAttribute("b","1");
for (const el of d.querySelectorAll("i")) console.log(el.className, dom.window.getComputedStyle(el).position);
```
