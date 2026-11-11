# Intent: the twin's own avatar

Author: the Author. Status: accepted (2026-11-10, "Yes, take those (Recommended)", to the session's question below). Created: 2026-11-10.

## Problem

The twin's figure in the room is a stand-in: the man's visitor model, labelled "The twin's figure is a stand-in, not the Author's likeness." (spec 009, FR-011 and FR-012). Spec 003 planned the twin's own avatar in its Phase 5, but wrote that phase to wait for spec 001's cloud relay, which the room no longer needs for this.

The Author, 2026-11-10: "Okay, my avatar twin is ready and imported in". He relayed the studio's hand-back, which the session can't read for itself, since the studio's folders are denied to agent sessions (spec 003, Phase 1). The relay says the folder holds:

- the twin's model, "its four first clips (idle, talking, listening, greeting) and its still", to go to `assets/twin/` as `twin.glb`, `idle.glb`, `talking.glb`, `listening.glb`, `greeting.glb` and `still.png`;
- "The shirt's lettering (twin-shirt-lettering.svg, .json and -brief.md) isn't a record entry: it's for the site's code, which draws "Denver Local AI Solutions" on the live face twin-shirt-lettering. The brief says how."
- the avatar caps, raised on main by his f21eff08 ("21,000,000 bytes, 180,000 triangles, 46,000,000 bytes of texture memory").

## Proposed outcome

- Visitors meet the twin as the Author's stylized likeness, in place of the stand-in, in 3D. 2D and phones keep their fallbacks.
- The twin's clips follow the conversation: greeting when a visitor arrives, listening while they type or speak, talking while it answers, idle otherwise.
- The twin's shirt shows "Denver Local AI Solutions", drawn by the site's code on the model's live face, as the brief describes.
- The stand-in line gives way to the Author's approved disclosure line, which says the avatar is an AI-made, stylized likeness of the Author, published by his choice (spec 003, FR-032 and FR-034). The credits reach the twin's record (FR-033).
- The files arrive through the arrival check like every studio output: clean bytes, a public record, the media licence, and the Author's approval of each file's hash, with the disclosure line in one of them.

## Affected users and systems

- Visitors: the twin's figure, its motion, its disclosure, the credits.
- The Author:
  - the intake commit;
  - the approvals, in `assets/policy/approvals.json`, his;
  - the disclosure line's words;
  - the shirt's text approval, if it counts as room text;
  - the lookdev look.
- `apps/web` (the room's figures, clips and live faces), the build's room data and its budgets (RK3 and RK5), and the arrival check's runs.
- Specs amended: 009 (the stand-in's end), 003 (Phase 5, re-planned without the relay), and 004 (live faces, if the shirt is one).

## Constraints

- **The constitution, spec 003's arrival rules (FR-006 to FR-019) and ADR 0010:**
  - the Mixamo-compatible skeleton;
  - for the twin, ARKit's 52 blendshapes and the 15 Oculus visemes;
  - the caps as raised.
- **Every file under `assets/twin/` needs its own approval** on main, naming its hash. At least one twin approval carries the disclosure line (the arrival check's P1 and P3).
- **Nothing in the files, records or what they show locates the Author.** Withheld details stay out of every committed file.
- **Agents read no studio folder and edit no `assets/**` or `assets/policy/**`.** The Author's own intake commit brings the files in, as the visitors' did (31df45d1), and the approvals come as his commit or a patch for his hand.
- **The first visit stays within its budget,** with the twin's clips counted. Desktop and phone, 2D, reduced motion all keep working.
- **Lip-sync is out of scope here** unless the Author wants it: the shapes arrive now, and using them is a later step.

## Expected cost impact

Cloud: none. Model spend: none at runtime. Dev time: agent sessions under the Author's plan.

## Data-flow impact

None new. The files are served from the site's own origin, like the visitors'.

## His answers (2026-11-10)

On the hand-off: "The paper can appear with us, we are building additional .glb that includes bones in the finger to grip, as well as leaning on the desk posture. We will add those later, I want to get this product out with the version we have"

Then the session asked: "To get the twin out with the version you have: may I take intent 016 as accepted, with these defaults for its open questions? Greeting plays when a visitor arrives, listening while they type or talk, talking while the twin answers, idle otherwise; lip-sync later (the face shapes ship unused for now); the shirt's "Denver Local AI Solutions" gets a content approval patch for you like the chalkboard's; the stand-in man stays as the fallback if your model can't load; and the paper appears with the visitor, your words." He answered: "Yes, take those (Recommended)".

The intake (2026-11-10):
- his approvals on main, 8997bf30, with the re-scrubbed hashes at 1bda726e. The disclosure line: "The twin is an AI-made, stylized likeness of the Author, shown by his choice.";
- his intake commit, a0e6fa1a ("assets(016): the twin") on `content/016-twin-avatar`, which passed the arrival check.

The second hand-back (2026-11-10). The Author: "Well, hold on, we have the twin with the finger bones, let's give you those files". It brings:
- 55 bones, with three per finger and per thumb;
- a fifth clip, `desk-lean.glb`, leaning back on the work desk, looping, with the desk's placement relative to the twin.

His approvals were updated on main at 0d2e3247 ("policy: the twin with fingers, and the lean"), with the lean's own approval. His intake commit, 6821d121 ("assets(016): the twin") on `content/016-twin-avatar`, passed the arrival check and replaces the first.

The session then suggested: "The lean: when does it play? My suggestion is the twin's resting pose between conversations: idle while you're there, greeting when you arrive, then listening and talking." And: "the paper still appears with you, as you said, unless you want a grip set in data now." He answered: "okay that is finished, update the runbook and go ahead". The session reads that as taking both suggestions, provisionally:
- the lean as the resting pose between conversations;
- the paper appearing with the visitor.

## Open questions, as answered above

- The disclosure line's exact words: the Author's.
- Which clip plays when, and how talking maps to the twin's reply. Is lip-sync now or later?
- The shirt's lettering:
  - Is it room text needing a content approval, like the chalkboard?
  - Does the live face follow spec 004's live-face rules?
- Does the stand-in remain as a fallback when the twin's files fail to load (spec 003, User Story 2)?
- Does the hand-off change, now that the twin's clips differ from the visitors' (no idle-holding)?
