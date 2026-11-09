# ADR 0036: The room composed from data

Status: proposed, 2026-10-23 · Spec: 004 (FR-001 to FR-019, FR-029, FR-053, FR-068; plan §2; research.md R-01 to R-16, R-23, R-36, R-63; contracts/room-data-files.md, contracts/room-bundle.md, contracts/plain-model-fit.md, contracts/intake-amendments.md §16)

## Context

Spec 002's room is code: its pieces, their IDs, their framing, and their pick areas live in `apps/web/src/room/objects.ts`, `framing.ts`, and `scene.ts`, with a hand-drawn SVG for the 2D room and CSS per ID. Intent 004 adds the work area's pieces (the desk, the ultrawide monitor and its terminal, the neon sign, the laptop on its stand with its charger, the chalkboard, two desk signs, the window and its artwork) beside spec 002's snowboard and bicycle, and the Author asked that they be built so they can move and multiply. In the Author's words, as spec 004 quotes them: "Think like a senior software architect, we will want to later modify and add pieces like these or move them around, so features should be modeled with that abstract perspective rather than one-off hard-coded".

Three more constraints shape the answer. The studio's models arrive through spec 003's intake, so what the room asks of a model must be checkable before the Author approves its hash. Every readable word in the room must come from room text the Author approved by hash, the published resume, the room's UI words, or a value the page computes, and a screen reader must get the same words (spec 004's FR-029, FR-063). And the size budgets are the Author's to set, not a branch's (FR-053).

## Decision

- **The room's content is data, one kind per file** (FR-001 to FR-008; R-01 to R-07): a piece catalog (`apps/web/room/catalog/<piece>.yaml`), one scene file of placements, mounts, switches, and selectables (`apps/web/room/scene.yaml`), topics, UI words, looks, and fixtures beside it, and room text in `apps/web/content/room/`, approved by hash. Every object is a strict schema: an unknown key or a value of the wrong type refuses the file. Pieces, placements, selectables, and topics have permanent IDs, and a retired ID is never reused.
- **The catalog and the scene compile into one deterministic bundle** (FR-009 to FR-014; R-08 to R-12). A Node-only compositor checks the data against nine rule families, each refusal naming its rule, file, and path, and writes one bundle that two builds of one commit make byte for byte. The 3D room, the 2D room, and the text copy all read it: its index in the entry chunk, its 3D part in the lazy chunk, and the approved room text in `room-data.json`. A kernel shared by the build and the page computes the framing, the pick areas, the cable runs, and the glyph heights, so the checks measure what the room draws.
- **Behaviour kinds are a closed list in code** (FR-005, FR-007; R-02, R-16): mount, frame, live face, glow, switch, cable, and selectable; the renderers terminal, desktop session, neon sign, chalk, and sign; the signals tier and turn cost; and the look methods. Data names a kind and gives its parameters, and no data value is evaluated as code. A new kind is code, through the lifecycle. A source scan keeps the IDs only data defines out of the room's code.
- **Studio pieces are plain models, through one fit check** (FR-015 to FR-019, FR-068; R-23): binary glTF with embedded textures, plain live faces of one colour, and nothing that carries behaviour. The fit check (RX1 to RX10) and its GLB reader are the same code in the compositor and in the lookdev page, so the hash the Author approves after lookdev is of a file the build will accept. A model that fails it keeps its piece's stand-in in the image build, so `make up` always works, and fails `make test`.
- **Every word is drawn live** (FR-029 to FR-035; R-36): from room text approved by hash on `main`, the published resume's section titles, UI words, or live values, by renderers that draw to display lists, so the text copy is the drawn words.
- **The caps are read from `main`** (FR-053; R-13): `assets/policy/caps.json`, human-only, by its full ref `refs/heads/main`, or from the web image's `policy` context, which `deploy/scripts/web_image.py` fills from it; never the branch's copy, so a branch can't raise its own caps. Without them, FR-053's starting figures apply and every model stays a stand-in.

## Alternatives considered

- **The hand-coded scene,** spec 002's: each piece a builder, its ID and framing in code. Rejected: every move or new piece is a code change that the checks can't tell from a behaviour change, and the 2D room, the pick areas, and the text copy each restate the scene by hand.
- **glTF `extras` for behaviour,** the model naming its own switches and faces. Rejected: spec 003's rule M4 and spec 004's FR-015 refuse extras in a studio file, and behaviour carried in a model would let data from outside the repository's review steer code.
- **A scripting layer,** data that holds expressions or code for its behaviour. Rejected: data would run as code, which FR-005 refuses, and a review of the data would have to review a program.
- **Text baked into textures.** Rejected: words couldn't change without a new model, couldn't be approved by hash, couldn't reach the text copy for screen readers, and couldn't be checked for legibility at the room's framing.

## Consequences

- Cost: $0 at run time. The compositor runs at build time, and no piece, poll, or renderer calls a model (FR-076).
- Moving, adding, or retargeting a piece is a data edit; SC-001's proof set holds that against the compositor and the source scan. A new behaviour kind is a reviewed code change, by design.
- The foundation adds three pinned development dependencies: zod, fontkit (already locked through pdfkit, made explicit), and pako (R-01, R-21, R-26). The room's typefaces are vendored and locked with `fonts.lock` schema 2 (Amendment B10).
- Degraded mode: a piece whose model is missing, fails its fit, or fails to load keeps its stand-in; with no caps on `main`, every piece builds as its stand-in; a 3D part whose digest disagrees with the index falls to the 2D room, which reads the same bundle.
- The room's data, its generated work orders, and its studio notes gain a review pass, "Room data", in the Author's patch to `REVIEW.md` (P-7).
- Two of spec 003's ADRs change with spec 004 on other branches: `ADR 0010` (the room's caps, then the look lookdev settles) and `ADR 0030` (the mark that follows the record). This ADR names them in code spans until they are on `main`.

## Links

- Intent: [intent 004](../../specs/004-room-composition/intent.md)
- Spec: [004 spec](../../specs/004-room-composition/spec.md) · Plan: [plan.md](../../specs/004-room-composition/plan.md) · Research: [research.md](../../specs/004-room-composition/research.md) · Contracts: [room-data-files.md](../../specs/004-room-composition/contracts/room-data-files.md), [room-bundle.md](../../specs/004-room-composition/contracts/room-bundle.md), [plain-model-fit.md](../../specs/004-room-composition/contracts/plain-model-fit.md)
- Merge request, in place of a PR until publication: the `feat/004-setup` note in `docs/merge-requests/` ([ADR 0013](0013-local-until-publication.md))
- Related: [ADR 0033](0033-the-rooms-stack-apps-web-vite-threejs.md), [ADR 0034](0034-content-approvals-by-hash-read-from-main.md), and, on spec 003's branches, `ADR 0010` and `ADR 0030`
