# ADR 0010: Real-time 3D avatar rig (not generated video); GTA V-inspired original art direction

Status: proposed, drafted 2026-10-18 by spec 003's second task group for the Author to accept, change, or leave proposed; spec 004 adds the room's caps (its Amendment C7), and it stays proposed until spec 004's lookdev records the look (spec 004, FR-070) · Spec: 003 (FR-017, FR-018, FR-019; research R-12, R-13), and the rig's Phase 2 spec; 004 (FR-052, FR-053, FR-077; Amendments C6, C7)

While this ADR is proposed, the arrival check refuses every avatar and animation (FR-018, rule F1): `assets/policy/caps.json` reads `"adr_0010": "not-accepted"`. Accepting it is the Author's patch to that file, with the caps below.

## Context

Intent 000 promises "an animated AI twin of me" and "four pre-generated avatars", in a room "whose art direction is inspired by GTA V: stylized illustrative realism, saturated light, cinematic framing. Inspired-by only — no Rockstar assets, logos, typefaces, or character likenesses; everything is original." Intent 003 asks for this ADR before the studio builds its workflow, "so nothing is made twice", and records where the survey of 2026-10-12 leaned:

> "Claude's survey of 2026-10-12 leans toward the convention three.js's TalkingHead library expects (glTF, a Mixamo-compatible skeleton, ARKit's 52 blendshapes, and the 15 Oculus visemes), because VRM's five vowels have no closed-lip shapes."

The survey itself is a private page, outside this repository (the intent's merge-request note). This draft rests on what the intent, spec 003, and its research quote from it. Spec 003's budget defaults are the frame: a first visit of at most 10 MB of assets in Phase 2 and 25 MB with the room, a 30 fps median on the reference phone, and a step down below 24 fps for 5 seconds (SC-006, FR-024).

## Decision (proposed)

- **A real-time 3D rig, not generated video.** The twin and the visitor avatars are glTF models animated in the browser (three.js), so the twin can answer any message and look the same in every frame; a generated video would need a model call per answer and couldn't follow the conversation.
- **The format:** binary glTF 2.0 (`.glb`), one file per model or animation, with its textures embedded as PNG, JPEG, or WebP (`EXT_texture_webp`), as the arrival check admits (research R-02). No Draco, meshopt, or KTX2 until an amendment adds them and the check grows to read them.
- **The skeletons:**
  - the twin and the two human visitor avatars: a Mixamo-compatible humanoid skeleton, its bones named as Mixamo names them (`mixamorig:Hips`, `mixamorig:Spine`, and so on), so one set of humanoid animations drives all three;
  - the dog and the dinosaur: a named rig each (`dog`, `dinosaur`), with their bones listed in the rig's spec when the characters are made; their animations live under `assets/animations/dog/` and `assets/animations/dinosaur/`.
- **The face, for the twin only:** ARKit's 52 blendshapes and the 15 Oculus visemes (`viseme_sil`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`, `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U`) as morph targets, named in `mesh.extras.targetNames`, the one `extras` the arrival check keeps. Visitors don't speak through their avatars, so theirs need body animation only (spec 003, Assumptions).
- **The first set** (spec 003, Assumptions): the twin with idle, talking, listening, and greeting animations and a still image for the 2D mode; the four placeholder visitors ("a generic woman, a generic man, a generic dinosaur, a generic dog", intent 000), each with an idle animation and a preview image.
- **Per-asset caps, by kind** (proposed starting values; the Author confirms or changes them against the reference phone before accepting):
  - `avatar`, the twin's model and each visitor's: at most 3,500,000 bytes, 30,000 triangles, and 16,777,216 bytes of texture memory;
  - `animation`: at most 500,000 bytes;
  - `still` and `preview`: at most 300,000 bytes each.

  At the caps, a first visit is 9,500,000 bytes, inside SC-006's 10 MB: the twin's model (3.5 MB), its four animations (2 MB), and a visitor's model (3.5 MB) and its idle (0.5 MB). In `caps.json` they read `"per_asset": {"avatar": {"bytes": 3500000, "triangles": 30000, "texture_bytes": 16777216}, "animation": {"bytes": 500000}, "still": {"bytes": 300000}, "preview": {"bytes": 300000}}`. The arrival check measures each file's bytes, triangles, and texture memory (width × height × 4 × 4/3) and refuses one over its kind's cap (rule F2), and refuses a first visit over its budget whatever the caps (rule F3), counted by transfer size.
- **The room's caps** (spec 004, Amendment C7; its FR-052 and FR-053), the Author's own commit on `main` (spec 004's P-6), in `per_asset.room`, which holds exactly these six keys, at FR-053's starting figures and FR-052's default floor:
  - `gzip_bytes`: 2,500,000, the bytes of a room file at gzip level 9, the bytes served, per file (the arrival check's F2) and per piece (spec 004's compositor);
  - `triangles`: 40,000, per GLB and per piece;
  - `small_props`: the pieces the Author names, a model file's stem being its piece's ID;
  - `small_prop_texture_px`: 1,024, the largest texture width or height on a small prop, a power of two;
  - `scene_texture_bytes`: 96,000,000, the whole scene's texture memory on a phone, width × height × 4 × 4/3 per texture, models, image cards, avatars, and live-face canvases together;
  - `legibility_floor_css_px`: 9, the smallest cap height a readable face may show, in CSS pixels, at the production framing on both reference stages.

  In `caps.json` they read `"room": {"gzip_bytes": 2500000, "triangles": 40000, "small_props": [...], "small_prop_texture_px": 1024, "scene_texture_bytes": 96000000, "legibility_floor_css_px": 9}`. The arrival check refuses a room file over its byte or triangle cap, or a small prop's texture over its side (F2), refuses every room file while the block is absent from `main`, and can't check (exit 2) while the block holds another key, or one of the wrong type; its first visit counts every file under `assets/room/` at gzip level 9, with phase 3's 25,000,000 bytes once that folder holds one (F3, Amendment C6). The caps are configuration the Author owns: agents never raise one (FR-053).
- **The reference phone and the mobile profile** (research R-13): a 2023 mid-range Android phone, a Samsung Galaxy A54 or the closest the Author has, recorded by model in each measurement; 9 Mbps down and a 150 ms round trip.
- **The capability floor** (the site's check before any 3D download, FR-023): WebGL2; where the browser reports it, `navigator.deviceMemory` of at least 4; and a maximum texture size of at least 4096. A device below it goes straight to the 2D mode.
- **The art direction:** stylized illustrative realism, saturated light, cinematic framing, as intent 000 puts it, and everything original: "no Rockstar assets, logos, typefaces, or character likenesses". The twin is a stylized likeness of the Author, made from the Author's photos; the visitors are original characters that resemble no real person (FR-017). `REVIEW.md`'s "Arriving assets" pass checks it on arrival.

## Alternatives considered

- **VRM** (VRoid's glTF profile): a ready standard for avatars, but its five vowel expressions have no closed-lip shapes for P, B, and M, which lip-sync needs (the survey's reason above).
- **Generated video** of the twin: photoreal, but a model call per answer, a lag the conversation can't hide, and nothing to fall back to when the local tier is off.
- **Compressed geometry and KTX2 textures now:** smaller downloads on phones, but the arrival check would need their decoders to see inside them (research R-02). An amendment can add them with the check's readers.

## Consequences

- The studio builds its workflow toward one target: these skeletons, these shapes, these caps.
- Until the Author accepts this ADR, no avatar or animation can enter the repository (FR-018). Stills, previews, and the evaluation's published images can.
- The arrival check enforces the caps (F2) and the first visit's total (F3). Checking each file against the skeleton's bone names and the twin's 67 shapes is a follow-up once this is accepted, as FR-018's "the skeleton, and, for the twin, the facial shapes" needs; until then `REVIEW.md`'s pass reads them.
- The caps are first estimates. The measurements on the reference phone (spec 003's waiting group, SC-005, SC-006) may tighten them, never loosen SC-006's budget.
- The room's files wait for the room's caps on `main`, and for the arrival check's spec 004 amendments (P-5), which `make test` holds before the first file under `assets/room/` (spec 004, FR-077). Spec 004's lookdev then records the look here (FR-070); if the Author accepts this ADR first, ADR 0037 amends it with the look instead.

## Links

Intent: `intent/000-ai-twin-portfolio.md`, `specs/003-studio-assets/intent.md`, `specs/004-room-composition/intent.md`. Spec: `specs/003-studio-assets/` (research R-12, R-13; contracts/arrival-check.md, rules F1 to F3); `specs/004-room-composition/` (data-model.md §9.1; research R-25, R-53, R-54; contracts/intake-amendments.md §7, §8). Merge requests: `docs/merge-requests/2026-10-18-feat-003-us1-arrival-check.md`, `docs/merge-requests/2026-10-27-feat-004-intake.md`.
