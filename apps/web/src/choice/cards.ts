// The selection screen's words (spec 029, group D; FR-024 to FR-031; plan.md §R-D1): the two steps, the role cards'
// descriptions, the avatar cards' lines, and the outcome card's. Every word here is a draft for the Author's look, taken
// under his rule 1 for night 4 (spec Q11 and Q13; the page's Q19 for the dog's line), and each says only what the code
// keeps: a role sets the twin's depth (config/twin/prompt.md's `## Depth:` sections, spec 007's FR-015), with the
// same facts on both; "in the 3D room" names what the 2D room doesn't give. `PATHS` (visit.ts) and `AVATARS`
// (avatars.ts) stay as they are: the hints, the credits page, and the build read them.
import type { AvatarId } from "./avatars";
import type { VisitPath } from "./visit";

export const STEPS = {
  role: {
    legend: "Step 1: Select your role",
    instruction: "Choosing a role takes you to step 2.",
  },
  avatar: {
    legend: "Step 2: Select your avatar",
  },
} as const;

/** Each role's description: the outcome card shows the chosen one's, and its radio is described by it. The second
 *  keeps the Author's own example, "The twin will describe projects and goals as if talking to a non-technical
 *  person", in his words. */
export const ROLE_CARDS: Readonly<Record<VisitPath, { readonly description: string }>> = {
  engineer: {
    description:
      "The twin answers at each topic's full depth: the architecture, the trade-offs, and how the systems work. The facts are the same on either role; only the depth changes.",
  },
  "non-engineer": {
    description:
      "The twin will describe projects and goals as if talking to a non-technical person: what the work does and why it matters, without jargon. The facts are the same on either role; only the depth changes.",
  },
};

/** The line under either role's description (spec 002's FR-002: the path is set once). */
export const ROLE_COMMON = "You choose once for this visit; reload the page to choose again.";

/** The outcome card before a choice. */
export const ROLE_EMPTY = "Choose a role to see how the twin will talk with you.";

/** Each avatar card's line. The dinosaur's eating is held to the composed room by test/ui/choice-cards.test.ts
 *  (FR-031); its scene isn't named. The dog's names no breed and no likeness: the approval's disclosure line stays
 *  whole on the credits page (build/credits.ts). */
export const AVATAR_LINES: Readonly<Record<AvatarId, string>> = {
  woman: "A generic woman. She takes the twin's paper and, in the 3D room, walks where you steer.",
  man: "A generic man. He takes the twin's paper and, in the 3D room, walks where you steer.",
  dinosaur:
    "A generic dinosaur. In the 3D room it can eat chunks of the desk, the laptop, the busy sign, and the chalkboard, and they grow back.",
  dog: "A dog. It walks the room and talks with the twin like any visitor.",
};

/** A chosen card's word, shown and hidden from assistive technology (the radio announces its own state). */
export const SELECTED = "Selected";

/** The hint under the steps, which "Enter" is described by (FR-024). */
export const HINT = "Choose a role and an avatar to enter.";
