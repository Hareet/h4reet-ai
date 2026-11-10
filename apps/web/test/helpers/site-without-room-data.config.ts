// The site's own Vite config, vite.config.ts, without its room-data part (build/approvals.ts's roomDataFile: the
// resume, its PDF, narration, and the room's text), for a test that builds the site under a policy the tree's content
// doesn't answer to. test/ui/pdf-download.test.ts builds under a fixture header to read the download name the build
// writes. The room-data part would hold the tree's own designed PDF, apps/web/content/resume-author.pdf, to that header,
// and PDF3 and PDF7 rightly refuse the Author's PDF under a stand-in name and contact (his gate of 2026-11-10). Every
// other plugin is the site's, in its order, so the name is written as the real build writes it.
import type { PluginOption, UserConfig } from "vite";

import site from "../../vite.config";

/** The room-data plugin's name (build/approvals.ts). */
export const ROOM_DATA_PLUGIN = "h4-room-data";

/** A plugin option's plugin names, nested arrays flattened; a falsy or pending option has none. */
export function pluginNames(options: readonly PluginOption[] | undefined): string[] {
  const names: string[] = [];
  const visit = (option: PluginOption): void => {
    if (Array.isArray(option)) for (const inner of option) visit(inner);
    else if (option && typeof option === "object" && "name" in option) names.push(option.name);
  };
  for (const option of options ?? []) visit(option);
  return names;
}

const isRoomData = (option: PluginOption): boolean =>
  !!option &&
  typeof option === "object" &&
  !Array.isArray(option) &&
  "name" in option &&
  option.name === ROOM_DATA_PLUGIN;

const config: UserConfig = { ...site, plugins: (site.plugins ?? []).filter((option) => !isRoomData(option)) };

export default config;
