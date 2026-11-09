// How the grounding is written into the prompt (spec 007; plan §4, §5), one form for the assembly's budget and for the
// prompt itself, as apps/web/build/twin-pack.ts's fit check counts it: each section under a delimiter line naming its
// file and heading, a Golden Q&A without its claim tags (D40), and the rules grouped by file, then the ownership
// rulings.
import type { Pack, PackSection } from "./pack.js";

/** A file's short name: `04-hobbies-and-travel` for `corpus/04-hobbies-and-travel.md`. */
export const shortName = (file: string): string => file.replace(/^corpus\//, "").replace(/\.md$/, "");

/** A section's text as the prompt writes it (spec 007's plan, D40): a Golden Q&A without the claim tags that end it, since
 *  its answer is given word for word and the local model copied them into one; every other section as the pack holds
 *  it, its tags kept for the instructions to read. The pack, and its hash, are unchanged. */
export function promptText(s: Pick<PackSection, "text" | "golden">): string {
  const tags = s.golden === null || s.golden.tags.length === 0 ? "" : ` ${s.golden.tags.join("")}`;
  return tags !== "" && s.text.endsWith(tags) ? s.text.slice(0, -tags.length) : s.text;
}

export const renderSection = (s: Pick<PackSection, "file" | "heading" | "text" | "golden">): string =>
  `[${shortName(s.file)} — ${s.heading}]\n${promptText(s)}\n\n`;

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
