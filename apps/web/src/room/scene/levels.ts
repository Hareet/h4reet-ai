// The quality levels (spec 002, R-04; spec 004, R-35, R-37; Amendment B13): what each of the quality controller's four
// levels draws, read by the 3D stage (scene.ts), the live faces (scene/faces3d.ts, faces/raster.ts), and the lookdev
// page. Spec 002 kept them in scene.ts; they moved here so the faces read them without a cycle through it.
export interface QualitySettings {
  /** The most device pixels a CSS pixel gets. */
  pixelRatio: number;
  /** The most device pixels the drawing buffer holds (spec 005, FR-010, FR-011; plan.md §4.2, D7): the ratio falls
   *  below pixelRatio where the canvas's area would take more (fit.ts's bufferRatio). Starting figures, tuned from the
   *  Author's lookdev runs, each one edit. */
  pixelCap: number;
  shadows: boolean;
  /** The look's outlines (spec 004, R-35). */
  outlines: boolean;
  /** The glow cards (spec 004, R-35). */
  glowCards: boolean;
  /** The terminal's typing, in redraws a second; 0 shows its final frame (spec 004, R-35, R-37). */
  typingFps: number;
  /** The live faces' canvas resolution, as a share (spec 004, R-35, R-37). */
  faceScale: number;
  /** The labels' texture resolution, as a share (the placeholders' only textures): R-35's label scale. */
  textureScale: number;
  /** The twin's idle sway: R-35's idle sway. */
  animations: boolean;
}

const LEVELS: readonly QualitySettings[] = [
  {
    pixelRatio: 2,
    pixelCap: 3_686_400,
    shadows: true,
    outlines: true,
    glowCards: true,
    typingFps: 15,
    faceScale: 1,
    textureScale: 1,
    animations: true,
  },
  {
    pixelRatio: 1.25,
    pixelCap: 2_304_000,
    shadows: true,
    outlines: true,
    glowCards: true,
    typingFps: 15,
    faceScale: 1,
    textureScale: 1,
    animations: true,
  },
  {
    pixelRatio: 1,
    pixelCap: 1_440_000,
    shadows: false,
    outlines: false,
    glowCards: false,
    typingFps: 8,
    faceScale: 1,
    textureScale: 1,
    animations: true,
  },
  {
    pixelRatio: 0.75,
    pixelCap: 921_600,
    shadows: false,
    outlines: false,
    glowCards: false,
    typingFps: 0,
    faceScale: 0.5,
    textureScale: 0.5,
    animations: false,
  },
];

/**
 * R-04's steps: the pixel ratio first, then shadows, then textures and animations. Spec 004's R-35 (Amendment B13)
 * steps the outlines and glow cards with the shadows, the typing at quality 2 and 3, and the faces with the textures,
 * still in four levels.
 */
export function qualitySettings(level: number): QualitySettings {
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, Math.round(level)))] as QualitySettings;
}
