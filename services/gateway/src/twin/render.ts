// How the grounding is written into the prompt (spec 007; plan §4, §5), one form for the assembly's budget and for the
// prompt itself, as apps/web/build/twin-pack.ts's fit check counts it: each section under a delimiter line naming its
// file and heading, and the rules grouped by file, then the ownership rulings.
import type { Pack, PackSection } from "./pack.js";

/** A file's short name: `04-hobbies-and-travel` for `corpus/04-hobbies-and-travel.md`. */
export const shortName = (file: string): string => file.replace(/^corpus\//, "").replace(/\.md$/, "");

export const renderSection = (s: Pick<PackSection, "file" | "heading" | "text">): string =>
  `[${shortName(s.file)} — ${s.heading}]\n${s.text}\n\n`;

export function renderRules(rules: Pack["rules"]): string {
  const byFile = new Map<string, string[]>();
  for (const r of rules.do_not_claim) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r.text]);
  const blocks = [...byFile].map(
    ([file, bullets]) => `[${shortName(file)}] Do not claim:\n${bullets.map((b) => `- ${b}`).join("\n")}\n\n`,
  );
  return `${blocks.join("")}[${shortName(rules.rulings.file)}] Ownership rulings:\n${rules.rulings.text}\n\n`;
}

/** The lead's line, after the sections: the piece's own words, from config/room-topics.yaml. */
export const renderLead = (lead: string | null): string => (lead === null ? "" : `The piece's lead: ${lead}\n\n`);
