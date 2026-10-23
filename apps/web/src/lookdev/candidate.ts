// A lookdev candidate (spec 004; FR-023, FR-067, FR-068, User Story 3 scenario 2; research.md R-41; contracts/lookdev.md
// §3, §4, plain-model-fit.md §10, §11, data-model.md §11.6): a model file the Author picks for one piece, held in page
// memory and judged by the compositor's own code. Its first 4 bytes are read first, through `slice(0, 4)`: a file that
// doesn't begin with GLB's magic, "glTF", is read no further, and the page keeps nothing of it, so a photo picked by
// mistake is never hashed, shown, or listed in the results (the review's page-10). A GLB's bytes then come from
// `File.arrayBuffer()`, and nothing else is read of the file, so its name is nowhere on the page or in the results.
// From the bytes: the SHA-256 (sha256.ts, in plain JavaScript, since the phone's copy may not be a secure context), the
// length, and the gzip-9 length (glb/gzip.ts, pako at level 9); the fit check (glb/fit.ts) against the piece's fit
// inputs, which virtual:room-lookdev carries from the compose, with RK2's reasons against the piece's budget, so the
// findings and measures are the compositor's for the same bytes and piece; and the mark's class, or "not scrubbed".
// Findings read `<rule> candidate:<path>: <reason>` in compose()'s order: RK2's path is `-`, which sorts before every
// other, and RK before RX, so RK2's come first.
// The bytes stay inside this module. `loadable` hands a copy to the room's parse path only where RX1 and RX2 pass and
// no image or buffer has a uri (RX3), since three's GLTFLoader fetches a buffer's uri and a candidate never makes a
// request; past that, whatever its other findings, so the Author sees a misfit at the room's framing. RX2's finding for
// a property the reader never reads (glb/rules.ts's READ_PAST: Blender's asset.generator, which spec 003's scrub drops,
// among them) keeps nothing out: the file is measured and swapped in, a preview of an unscrubbed file, as one without
// the mark is, every finding listed (plan.md §10). Only a scrubbed file with no finding has a hash to approve. A reload
// forgets it: nothing is stored, no object URL is made, and nothing is sent.
import type { RoomScene } from "../room/compose/bundle";
import { budgetReasons, fit, render } from "../room/glb/fit";
import type { Budget, FitInput, GlbFinding, Measures } from "../room/glb/fit";
import { gzipBytes } from "../room/glb/gzip";
import { READ_PAST, REASON } from "../room/glb/rules";
import type { MarkClass } from "../room/glb/rules";
import { sha256 } from "./sha256";

/** What a candidate is judged against, as virtual:room-lookdev gives each piece (contracts/room-bundle.md §3.3): its
 *  expected bounds and live faces at its stylized scale with the caps' small-prop limit, and its budget. */
export interface PieceFit {
  readonly fit: FitInput;
  readonly budget: Budget;
  readonly small_prop: boolean;
}

/** The file a candidate's findings name: the page and the results key each candidate by its piece. */
export const CANDIDATE_FILE = "candidate";
/** FR-068's words for a file without spec 003's mark. */
export const NOT_SCRUBBED = "not scrubbed";
/** What a candidate's row says of a picked file that doesn't begin with GLB's magic. */
export const NOT_GLB = "not a GLB: nothing kept";
/** What a candidate swapped in without spec 003's scrub is, a view only: its hash is never one to approve. */
export const PREVIEW = "preview of an unscrubbed file";

/** Why a candidate stays out of the room's parse path: RX1, an RX2 problem that keeps the reader from reading it, or a
 *  uri, which three would fetch. */
export type Refusal = "RX1" | "RX2" | "uri";
/** What the page says of each refusal. */
export const REFUSAL: Readonly<Record<Refusal, string>> = {
  RX1: "RX1 refuses the file",
  RX2: "RX2 refuses the file",
  uri: "it names a uri, which the page never fetches",
};

/** The refusal a finding makes, if any. */
function refusalOf(f: GlbFinding): Refusal | null {
  if (f.rule === "RX1") return "RX1";
  if (f.rule === "RX2" && !READ_PAST.has(f.reason)) return "RX2";
  return f.rule === "RX3" && f.reason === REASON.uri ? "uri" : null;
}

/** GLB's magic, the first 4 bytes of every GLB: "glTF". */
const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46] as const;

/** Whether a picked file begins with GLB's magic, read from its first 4 bytes alone. */
export async function startsAsGlb(file: Pick<Blob, "slice">): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, GLB_MAGIC.length).arrayBuffer());
  return head.length === GLB_MAGIC.length && GLB_MAGIC.every((byte, i) => head[i] === byte);
}

export interface Candidate {
  readonly piece: string;
  /** The SHA-256 the Author approves (FR-023, FR-068). */
  readonly sha256: string;
  /** The file's length. */
  readonly bytes: number;
  /** Its gzip-9 copy's length: what the site would send (plain-model-fit.md §7). */
  readonly gzipBytes: number;
  /** §7's measures: triangles, texture memory, bounds, and the rest; only the bytes where RX1 or RX2 refuses it, but
   *  for a property the reader reads past. */
  readonly measures: Measures;
  /** Whether it carries spec 003's mark at all. */
  readonly scrubbed: boolean;
  /** The mark's class, where its form and value are RX5's. */
  readonly mark: MarkClass | null;
  /** `<rule> candidate:<path>: <reason>`, RK2's and RX's, in compose()'s order. */
  readonly findings: readonly string[];
  /** Whether the room's parse path may take it: RX1 and RX2 pass, but for a property the reader reads past, and no
   *  image or buffer has a uri. */
  readonly swappable: boolean;
  /** Why it isn't swappable; null where it is. */
  readonly refusal: Refusal | null;
  /** Whether it swaps in as a preview of an unscrubbed file: it has no mark, or holds a property the scrub drops. */
  readonly preview: boolean;
}

/** Each candidate's bytes, which only `loadable` hands out. */
const held = new WeakMap<Candidate, Uint8Array>();

/** A candidate of bytes this module owns. */
function judge(piece: string, bytes: Uint8Array, inputs: PieceFit): Candidate {
  const gz = gzipBytes(bytes);
  const result = fit(bytes, inputs.fit, { file: CANDIDATE_FILE, gzipBytes: gz });
  const m = result.measures;
  // Held to its budget as the compose holds a model: once RX1 and RX2 pass, which its measures need.
  const over =
    m.triangles === null
      ? []
      : budgetReasons(
          { served: gz, triangles: m.triangles, maxTexturePx: m.maxTexturePx, textureBytes: m.textureBytes ?? 0 },
          inputs.budget,
          "glb",
        );
  const refusal = result.findings.map(refusalOf).find((r) => r !== null) ?? null;
  const readPast = result.findings.some((f) => f.rule === "RX2" && READ_PAST.has(f.reason));
  const candidate: Candidate = {
    piece,
    sha256: sha256(bytes),
    bytes: bytes.length,
    gzipBytes: gz,
    measures: m,
    scrubbed: result.scrubbed,
    mark: result.mark,
    findings: [...over.map((reason) => `RK2 ${CANDIDATE_FILE}:-: ${reason}`), ...result.findings.map(render)],
    swappable: refusal === null,
    refusal,
    preview: refusal === null && (!result.scrubbed || readPast),
  };
  held.set(candidate, bytes);
  return candidate;
}

/** A candidate of `data` for `piece`, judged against its fit inputs. The candidate keeps a copy of the bytes, so the
 *  hash it shows is of the bytes it hands over. */
export function judgeCandidate(piece: string, data: Uint8Array, inputs: PieceFit): Candidate {
  return judge(piece, data.slice(), inputs);
}

/** A picked file as a candidate for `piece`: read with `arrayBuffer()`, and nothing else read of it. */
export async function readCandidate(
  piece: string,
  file: Pick<Blob, "arrayBuffer">,
  inputs: PieceFit,
): Promise<Candidate> {
  return judge(piece, new Uint8Array(await file.arrayBuffer()), inputs);
}

/** A copy of the candidate's bytes for the room's parse path (the GLTFLoader plugin the room uses), or null where it
 *  mustn't reach it: RX1 or RX2 refuses the file, but for a property the reader reads past, or it names a uri, which
 *  three would fetch. */
export function loadable(candidate: Candidate): ArrayBuffer | null {
  const bytes = held.get(candidate);
  return bytes === undefined || !candidate.swappable ? null : bytes.slice().buffer;
}

/** The mark as the page shows it: its class, "not scrubbed", or that RX5 refuses its form or value. */
export function markReadout(candidate: Pick<Candidate, "scrubbed" | "mark">): string {
  if (!candidate.scrubbed) return NOT_SCRUBBED;
  return candidate.mark ?? "a mark RX5 refuses";
}

/** The pieces a candidate may be picked for (contracts/lookdev.md §3), in the fit inputs' order: every piece but the
 *  figures', whose placements spec 003's avatars show. A piece a switch or another placement shows takes one. */
export function candidatePieces(
  scene: Pick<RoomScene, "placements" | "switches" | "figures">,
  pieces: Readonly<Record<string, PieceFit>>,
): string[] {
  const figures = new Set([scene.figures.twin, scene.figures.visitor]);
  const figureOnly = (piece: string): boolean => {
    const placed = scene.placements.filter((p) => p.piece === piece);
    return (
      placed.length > 0 && placed.every((p) => figures.has(p.id)) && !scene.switches.some((s) => s.piece === piece)
    );
  };
  return Object.keys(pieces).filter((piece) => !figureOnly(piece));
}
