// The visit (spec 002, FR-002, FR-003; data-model.md §9): one page load, from the choice to the page's close or
// reload. It lives only in the page's memory: startRoom makes one per page, which is the page's only one, and nothing
// writes it to a cookie, browser storage, or the URL. A reload starts a new one at `choosing`.
import type { AvatarId } from "./avatars";

export type VisitPath = "engineer" | "non-engineer";

export const PATHS: readonly { id: VisitPath; name: string }[] = [
  { id: "engineer", name: "Engineer" },
  { id: "non-engineer", name: "Not an engineer" },
];

export function isVisitPath(value: unknown): value is VisitPath {
  return PATHS.some((p) => p.id === value);
}

export type VisitStage = "choosing" | "handoff" | "room";

/** The room's rendering: the 3D scene at full quality, at a lowered quality, or the 2D drawing (R-04). */
export type Mode = "3d" | "reduced" | "2d";

export interface Turn {
  role: "visitor" | "twin";
  text: string;
}

export interface Visit {
  /** Set once at the choice; never changed (FR-002). */
  path: VisitPath | null;
  avatar: AvatarId | null;
  stage: VisitStage;
  mode: Mode;
  /** The quality controller's level, 0 to 3. */
  quality: number;
  /** The conversation so far: empty until conversations exist (Phase 7). */
  turns: Turn[];
}

export function newVisit(): Visit {
  return { path: null, avatar: null, stage: "choosing", mode: "3d", quality: 0, turns: [] };
}
