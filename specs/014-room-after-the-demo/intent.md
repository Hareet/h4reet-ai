# Intent: the room after the demo

Author: the Author. Status: accepted ("I accept the intent with your recommendations. go for it!", 2026-11-10). Created: 2026-11-10.

## Problem

The Author ran the demo on prod after spec 005 merged (main b335b9b2) and recorded what he saw, with a screenshot (`resume/Screenshot 2026-11-10 074549.png`, untracked). In his words:

> "The room does get resized, but see how the actual room is smaller in the browser window size with grey area next to the brick. We can move the interface to lay over that grey area. We could make the game buttons and interface look newer, perhaps this skill could help: https://github.com/openai/plugins/tree/HEAD/plugins/game-studio/skills/game-ui-frontend . The langfuse meter did not display the cost of the current conversation when we definitely had the local model down and were using anthropic. The resume paper goes into the arm area and doesnt neatly stay in the hand. When we click walk around, the camera shifts to an angled perspective, is that necessary or can we just have walk around from the initial angle the room starts in. denverlocal.ai is not written on the chalkboard."

At acceptance he added one more: "One small change, i think the glow around the neon sign is a big circle, and the glowing part should be the actual neon letters and neon part that frames the arrow in the sign."

What the session's read-only trace found for each (2026-11-10). These are the session's reading, not the Author's words:

- **The grey bands.** The canvas already fills the window, and the panels are glass over it. But the room is framed to fit inside a clear area that leaves out the strip, the bar and the right column (spec 005 FR-016, the Author's Q5 answer "Whole room, more around (Recommended)"). The room is about square, so on a landscape window its height binds and the extra width shows the plain backdrop. In walking mode the camera also follows the figure sideways, so the room sits off-centre.
- **The look.** The bar's tiles are dark glass, as spec 005 asks. The list's buttons, the conversation's buttons and the two notes at the top left still use the page's base white button style.
- **The sign.** It reads `local · $0` only when a turn's reply says `route: local` with a cost of 0. Reading the code, the chain from the gateway's price for the Anthropic model to the sign is correct and tested. But the Author stopped the local model's container, and `make status ENV=prod` afterwards showed `local unhealthy: not_ready, anthropic healthy` with the model server's Prometheus target down. He adds: "The turns were definitely not done before the stop took effect. I stopped the local model well before i visited the demo site and ran the conversation". The cause, confirmed: gate 5's `make up ENV=prod` ran after the stop and started the model server again ("yes, make up put the local model bakc"), so the demo's turns were answered locally and the sign was right. Then he stopped the local model again and selected the snowboard: "Yup, it's working now! ive clicked the snowboard and the cost is changing". So the sign follows the paid route on the live stack. A check from end to end, with the local model down, from the gateway through the edge and the page to the sign, would keep it proven. Nothing tests a real turn with the local model down, end to end through the edge and the page, to the sign. This is to confirm on the live stack.
- **The paper.** It hangs from the hand bone's origin, the wrist, and is lifted straight up in world space by half its height. With the arm hanging, that puts the sheet along the forearm. There is no grip offset or rotation per avatar.
- **Walking.** "Walk around" starts the follow camera tilted 35° down (the pitch limit) and centred on the figure. Spec 008 allows level to 35°, so nothing requires the tilt.
- **The chalkboard.** Its text, `apps/web/content/room/chalk-denverlocal.yaml`, is a draft until the Author approves its SHA-256 as `room-text` on main (T203). A release build leaves the slate plain. The twin says the board shows it because the corpus says so (`corpus/05-mission.md`).
- **Also seen:** the note "Placeholder shapes stand in for the room's pieces until their models arrive" still shows. It is set by missing avatar models (the twin's, and two of the avatar choices), not by the room's pieces.

## Proposed outcome

The Author's answers, 2026-11-10:

- **The bands:** "Overlay only". The room is framed into the whole window with the interface laid over it, so it recentres and grows. A wide window may still show plain sides; no new scenery and no cropping.
- **Walking:** "Start from the room's view (Recommended)". Walking begins at the starting camera, level and centred, and the camera moves only when the visitor turns, tilts or zooms it, or the figure nears an edge.
- **The plan:** "One spec for all". One spec covers every item above, built and gated together.

In the visitor's terms:

- The room fills the window, and the panels and buttons sit over it.
- The buttons and panels look newer and like part of the game, using the game UI guidance the Author pointed to.
- The resume paper sits in the hand.
- Walking starts from the view the room opens with.
- The chalkboard shows denverlocal.ai.
- The sign's cost and route can be trusted, with an end-to-end check to prove it.
- The neon sign glows along its letters and the tube that frames its arrow, not as a big circle behind it.

## Affected users and systems

- Visitors: the room's layout, framing, HUD look, walking camera, the hand-off's paper, the chalkboard and the neon sign's glow.
- The Author:
  - the room-text approval for the chalkboard (his file, `assets/policy/content-approvals.json`);
  - the look at lookdev;
  - the live check of the sign;
  - and, if he wants, the corpus line on what the board shows.
- `apps/web` (room, HUD, walking, avatars), the build's room data, and their tests.
- Specs amended: 005 (framing and look), 008 (walking's start), 009 (the paper's grip) and 004 (the placeholder note's trigger or words).
- The local tier and the stack's end-to-end checks: a paid-route turn reaching the sign.

## Constraints

- **The constitution and this repository's rules.** Room data is data: placements and behaviours, not code, for new pieces (the Author's "features as data"). The model call stays in the gateway, and the sign keeps reading only the turn's reply, never Langfuse.
- **Spec 005's rules that stay:**
  - the room is never stretched;
  - the stand-in line and the disclosure are never covered;
  - the HUD meets WCAG's contrast floors (`test/room/hud-contrast.test.ts`);
  - selectable pieces stay reachable when panels lie over them.
- **The game UI guidance** is third-party, read from the Author's copy at `docs/research/game-ui-frontend-openai-skill.md`. It is cited by its URL and not committed unless its licence allows it. Its points that matter here: keep the playfield clear; one persistent cluster and a small second one at most; long text behind drawers; and persistent HUD covering about 20-25% of a desktop window at most.
- **Assets:** no new models are needed. Any studio work stays outside, and only its outputs come in (intent 003).
- **Agents** don't edit `assets/policy/`, `corpus/`, `.claude/**` or the gates. The approval comes as a patch for the Author's hand, and a corpus change comes as a proposal.
- **Desktop and phone widths**, 2D view and reduced motion all keep working.

## Expected cost impact

- Cloud spend: none.
- Model spend: none at runtime. The end-to-end check uses the stack's fake adapters, never a paid call.
- Dev time: agent sessions under the Author's plan.

## Data-flow impact

None. No new byte leaves the visitor's device or the local tier. The fonts and icons for the new look are self-hosted, with no new third-party request.

## Open questions

- **The HUD budget:** a cap on persistent coverage (the guidance's 20-25%), and where the conversation sits: always open in the column, or in a drawer that opens when asked.
- **The visual direction for "newer":** materials (the room's brick, chalk, neon), type, motion, and what changes on phones.
- **The framing:** with the panels overlaid, does the room frame to the whole window or to the window minus the bar? How are pieces kept clickable under a panel?
- **Walking:** what counts as "the figure nears an edge"? Does the first turn, tilt or zoom hand over to the follow camera smoothly?
- **The paper:** one grip per avatar from data, checked at lookdev for the man and the woman, in each hand?
- **The chalkboard:** the Author's room-text approval comes after gate 4's C-0002, as the next entry in the same file. Until then, should the twin say what the board shows?
- **The placeholder note:** reword it for what's missing, or count only the room's pieces?
- **The sign:** the Author's live reading of the route and cost, and where the end-to-end check runs.
