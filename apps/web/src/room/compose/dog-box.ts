// The room's dog's box at its home (spec 026; FR-014; plan.md R-09; the page's Q160): the one box the compositor's RG6
// and the room's pointer project for the `dog` selectable's front-only rectangle. Pure, from data, never loaded geometry
// (spec 004's R-18): centred on `figures.dog.home.at`, AVATAR_SHAPES.dog's width along the dog's heading and
// `footprint_m` across, from the floor to its height, turned by `heading_deg` (spec 008's heading: h faces
// (−sin h, −cos h)); given as that turned box's axis-aligned bounds, the shape `memberRect` projects (at a heading off the
// axes they are larger than the box).
import type { Box } from "./framing";

export interface DogHomeData {
  readonly home: { readonly at: readonly [number, number]; readonly heading_deg: number };
  readonly footprint_m: number;
}

export function dogBoxAt(
  dog: DogHomeData,
  shape: { readonly width: number; readonly height: number },
  floorY = 0,
): Box {
  const h = (dog.home.heading_deg * Math.PI) / 180;
  const fx = -Math.sin(h);
  const fz = -Math.cos(h);
  const rx = Math.cos(h);
  const rz = -Math.sin(h);
  const halfL = shape.width / 2;
  const halfW = dog.footprint_m / 2;
  const ex = Math.abs(fx) * halfL + Math.abs(rx) * halfW;
  const ez = Math.abs(fz) * halfL + Math.abs(rz) * halfW;
  const [x, z] = dog.home.at;
  return { min: [x - ex, floorY, z - ez], max: [x + ex, floorY + shape.height, z + ez] };
}
