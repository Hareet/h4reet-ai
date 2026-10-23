// The room's command line (spec 004; FR-007, FR-013, FR-014, FR-073; R-08, R-10, R-14, R-16; contracts/room-bundle.md
// §12, §13; contracts/room-data-files.md §14 to §16; contracts/plain-model-fit.md §10): `npm run room:<command> -w
// apps/web`, over the repository's tree and main's policy (policy.ts: ROOM_POLICY_DIR, else refs/heads/main, else the
// export's own copy).
//   generate                composes as a release build, in lenient mode, and writes §7 to §9's generated files,
//                           removing a work order whose piece is gone; with a finding lenient mode doesn't tolerate, it
//                           prints every finding and writes nothing (exit 1), and it never writes through a link
//   check                   composes in strict mode, with drafts, and holds the generated files fresh (§13); it prints
//                           every finding, then `room: <n> findings in <m> files`, and exits 1 on any
//   report                  prints FR-073's report of a release build in strict mode; exit 0, its findings in it
//   scan                    the source scan (scan.ts); exit 1 on any hit
//   fit <glb> --piece <id>  RX1 to RX10 and RK2 on one GLB in the tree against one catalog entry, the compose's own
//                           rules, with its measures beside its budget; it reads the file in place and copies it
//                           nowhere; exit 1 on any finding
// A usage error, a file outside the tree, and a policy that can't be read exit 2. A finding prints as §14 has it. A
// stale generated file is named by its first differing line's number, never by either side's text, since a generated
// line can hold a string RT2 refused; the fix is always `npm run room:generate -w apps/web`.
import { lstatSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { unreadable } from "../../src/room/glb/fit";
import { count } from "../../src/room/glb/rules";
import { firstDifference } from "../manifest";
import { REPO_ROOT } from "../policy";
import { compareFindings } from "./checks/family";
import { checkModel, overBudget } from "./checks/rx";
import type { ModelCheck } from "./checks/rx";
import { compose, formatFinding } from "./compose";
import type { Finding } from "./compose";
import { loadRoom } from "./load";
import { WORK_ORDERS_DIR } from "./orders";
import { capsOf, readRoomPolicy } from "./policy";
import type { RoomPolicy } from "./policy";
import type { CatalogEntry } from "./schema";
import { compareBytewise, fileTree, isTreePath } from "./source";
import type { Tree } from "./source";

/** What the command line works through: the repository, the folder a path is read from, the environment main's policy
 *  is found by, and its two streams, a line at a time. */
export interface CliIo {
  /** The repository's root. */
  readonly root: string;
  /** Where a path on the command line is read from: npm's INIT_CWD, the folder npm ran in, or the process's own. */
  readonly cwd: string;
  /** ROOM_POLICY_DIR, for main's policy. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

const GENERATE = "npm run room:generate -w apps/web";
const COMMANDS: readonly string[] = ["generate", "check", "report", "scan", "fit"];
const USAGE = [
  "usage: build/room/cli.ts <command>, as npm run room:<command> -w apps/web runs it",
  "  generate                write the generated files from the room's data",
  "  check                   the room's data in strict mode, and the generated files' freshness",
  "  report                  FR-073's report, in Markdown",
  "  scan                    the source scan: no ID of the room's data in the code",
  "  fit <glb> --piece <id>  the fit check of one GLB in the tree against one catalog entry",
];

/** A file's text with any byte-order mark kept, so a file that holds one is stale. */
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A line a command prints for a file. */
interface Line {
  readonly file: string;
  readonly text: string;
}

/** `room: <n> findings in <m> files`, over the findings a command printed (contracts/room-data-files.md §14). */
function tally(lines: readonly { readonly file: string }[]): string {
  return `room: ${plural(lines.length, "finding")} in ${plural(new Set(lines.map((l) => l.file)).size, "file")}`;
}

function usage(io: CliIo): number {
  for (const line of USAGE) io.err(line);
  return 2;
}

// ---- The generated files (§7 to §9, §13) ----

/** Whether a file's bytes are the build's text. */
const same = (data: Uint8Array, text: string): boolean => Buffer.compare(data, Buffer.from(text, "utf8")) === 0;

/** The work orders whose piece is gone: each `.md` file under docs/studio/work-orders/ the compose doesn't write. */
function orphans(tree: Tree, generated: ReadonlySet<string>): string[] {
  return tree
    .list(WORK_ORDERS_DIR)
    .map((name) => `${WORK_ORDERS_DIR}/${name}`)
    .filter((path) => path.endsWith(".md") && !generated.has(path) && tree.read(path) !== null);
}

/** The number of the first line where a committed file and the build's text differ (spec 002's firstDifference, whose
 *  message quotes both lines), or `-` where only their bytes do. */
function staleLine(committed: string, fresh: string): string {
  return /^line (\d+):/.exec(firstDifference(committed, fresh) ?? "")?.[1] ?? "-";
}

/** §13: each generated file as the build writes it, none missing, and no work order whose piece is gone. */
function freshness(tree: Tree, generated: readonly { readonly path: string; readonly text: string }[]): Line[] {
  const line = (file: string, where: string, reason: string): Line => ({
    file,
    text: `FR-013 ${file}:${where}: ${reason}`,
  });
  const out: Line[] = [];
  for (const g of generated) {
    const data = tree.read(g.path);
    if (data === null) out.push(line(g.path, "-", `missing; ${GENERATE} writes it`));
    else if (!same(data, g.text))
      out.push(line(g.path, staleLine(decoder.decode(data), g.text), `stale; ${GENERATE} rewrites it`));
  }
  for (const path of orphans(tree, new Set(generated.map((g) => g.path))))
    out.push(line(path, "-", `orphaned: no catalog entry has its stem; ${GENERATE} removes it`));
  return out.sort((a, b) => compareBytewise(a.file, b.file));
}

/** Whether `path` can be written or removed under `root` without following a link: each folder on its way a folder or
 *  absent, and the file itself, where it exists, a regular file. */
function safe(root: string, path: string): boolean {
  if (!isTreePath(path) || path === "") return false;
  const parts = path.split("/");
  let at = root;
  for (const [i, part] of parts.entries()) {
    at = join(at, part);
    const stat = lstatSync(at, { throwIfNoEntry: false });
    if (stat === undefined) return true;
    if (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) return false;
  }
  return true;
}

function generate(io: CliIo, policy: RoomPolicy): number {
  const tree = fileTree(io.root);
  const result = compose(tree, policy, { mode: "lenient", drafts: false });
  for (const f of result.findings) io.out(formatFinding(f, "lenient"));
  if (result.findings.length > 0) io.out(tally(result.findings));
  if (result.findings.some((f) => !f.lenient)) {
    io.out("room: nothing written: lenient mode tolerates only RX and RK2 findings");
    return 1;
  }
  const writes = result.generated.filter((g) => {
    const data = tree.read(g.path);
    return data === null || !same(data, g.text);
  });
  const removals = orphans(tree, new Set(result.generated.map((g) => g.path)));
  const unsafe = [...writes.map((g) => g.path), ...removals].filter((path) => !safe(io.root, path));
  if (unsafe.length > 0) {
    for (const path of unsafe) io.err(`room: ${path} is reached through a link, or isn't a regular file`);
    io.err("room: nothing written");
    return 2;
  }
  for (const g of writes) {
    const full = join(io.root, ...g.path.split("/"));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, g.text);
    io.out(`wrote ${g.path}`);
  }
  for (const path of removals) {
    rmSync(join(io.root, ...path.split("/")));
    io.out(`removed ${path}`);
  }
  const unchanged = result.generated.length - writes.length;
  io.out(`room: ${writes.length} written, ${removals.length} removed, ${unchanged} unchanged`);
  return 0;
}

function check(io: CliIo, policy: RoomPolicy): number {
  const tree = fileTree(io.root);
  const result = compose(tree, policy, { mode: "strict", drafts: true });
  const lines: Line[] = [
    ...result.findings.map((f) => ({ file: f.file, text: formatFinding(f, "strict") })),
    ...freshness(tree, result.generated),
  ];
  for (const line of lines) io.out(line.text);
  io.out(tally(lines));
  return lines.length > 0 ? 1 : 0;
}

// ---- The report and the scan ----

function report(io: CliIo, policy: RoomPolicy): number {
  const result = compose(fileTree(io.root), policy, { mode: "strict", drafts: false });
  io.out(result.report.markdown.replace(/\n$/, ""));
  return 0;
}

/** The source scan, loaded only here: TypeScript's parser is the one heavy import the other commands don't need. */
async function scanCode(io: CliIo, policy: RoomPolicy): Promise<number> {
  const { scan } = await import("./scan");
  const tree = fileTree(io.root);
  const result = scan(tree, tree, policy);
  for (const line of result.lines) io.out(line);
  io.out(`room: ${plural(result.lines.length, "hit")}`);
  return result.code;
}

// ---- fit <glb> --piece <id> ----

/** `<glb> --piece <id>`, in either order, `--piece=<id>` too; null for anything else. */
function fitArgs(args: readonly string[]): { readonly glb: string; readonly piece: string } | null {
  let glb: string | undefined;
  let piece: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--piece") {
      piece = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--piece=")) piece = arg.slice("--piece=".length);
    else if (glb === undefined && !arg.startsWith("-")) glb = arg;
    else return null;
  }
  return glb === undefined || piece === undefined || piece === "" ? null : { glb, piece };
}

/** A length to 1e-6 m, −0 as 0. */
const metres = (n: number): string => String(Math.round(n * 1e6) / 1e6 || 0);
const point = (v: readonly number[]): string => `(${v.map(metres).join(", ")})`;

/** §7's measures of the checked file, then its piece's budget. */
function measureLines(checked: ModelCheck, budget: CatalogEntry["budget"]): string[] {
  const m = checked.measures;
  const out: string[] = [];
  if (m === null) out.push("measures: none: the file doesn't read as a GLB");
  else {
    const side = m.maxTexturePx === null ? "no texture" : `a largest texture side of ${count(m.maxTexturePx)} px`;
    out.push(
      `measures: ${count(m.bytes)} bytes · ${count(m.served)} gzip-9 bytes · ${count(m.triangles ?? 0)} triangles · ` +
        `${count(m.textureBytes)} bytes of texture memory · ${side}`,
    );
    if (m.bounds !== null) out.push(`bounds: ${point(m.bounds.min)} to ${point(m.bounds.max)} m`);
  }
  out.push(
    `budget: ${count(budget.gzip_bytes)} gzip-9 bytes · ${count(budget.triangles)} triangles · ` +
      `${count(budget.texture_px)} px a side · ${count(budget.texture_bytes)} bytes of texture memory`,
  );
  return out;
}

function fitModel(args: readonly string[], io: CliIo, policy: RoomPolicy): number {
  const parsed = fitArgs(args);
  if (parsed === null) return usage(io);
  const { glb, piece } = parsed;
  if (!glb.endsWith(".glb")) {
    io.err("room: room:fit judges a .glb file");
    return 2;
  }
  const path = relative(io.root, resolve(io.cwd, glb)).split(sep).join("/");
  if (!isTreePath(path) || path === "") {
    io.err(`room: ${glb} isn't in the repository: room:fit reads files in the tree only`);
    return 2;
  }
  const tree = fileTree(io.root);
  const entry = loadRoom(tree).catalog.find((c) => c.value.id === piece);
  if (!entry) {
    io.err(`room: no catalog entry ${piece} loads; npm run room:check -w apps/web says why`);
    return 2;
  }
  // Read in place, through the tree, which follows no link: nothing is copied anywhere.
  const bytes = tree.read(path);
  const checked: ModelCheck =
    bytes === null
      ? { entry, file: path, kind: "glb", measures: null, findings: [unreadable(path)] }
      : checkModel(entry, path, "glb", bytes, capsOf(policy));
  const findings: Finding[] = [
    ...checked.findings.map((f) => ({ ...f, lenient: true })),
    ...overBudget(checked).map((reason) => ({ rule: "RK2", file: path, path: "-", reason, lenient: true })),
  ].sort(compareFindings);
  for (const f of findings) io.out(formatFinding(f, "strict"));
  for (const line of measureLines(checked, entry.value.budget)) io.out(line);
  io.out(tally(findings));
  return findings.length > 0 ? 1 : 0;
}

// ---- The command line ----

/** Runs one command; its exit code. */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const [command, ...args] = argv;
  if (command === undefined || !COMMANDS.includes(command) || (command === "fit") !== args.length > 0) return usage(io);
  let policy: RoomPolicy;
  try {
    policy = readRoomPolicy({ env: io.env, root: io.root });
  } catch (error) {
    io.err(`room: main's policy can't be read: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  switch (command) {
    case "generate":
      return generate(io, policy);
    case "check":
      return check(io, policy);
    case "report":
      return report(io, policy);
    case "scan":
      return scanCode(io, policy);
    default:
      return fitModel(args, io, policy);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await run(process.argv.slice(2), {
    root: REPO_ROOT,
    cwd: process.env.INIT_CWD || process.cwd(),
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}
