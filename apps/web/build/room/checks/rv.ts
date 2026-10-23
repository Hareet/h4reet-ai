// RV, vector drawings (spec 004; FR-005, FR-009, FR-058; R-39; contracts/room-data-files.md §4.2, §13.6): every piece
// has a 2D drawing, and a drawing of its own primitives holds at least one, so it draws something (RV1, after FR-009's
// "every placement and switch case has its 2D vector drawing"); a drawing derived from the stand-in holds no polygon
// outside 2 to 256 points, as a stand-in polygon of more would give (RV2's part the loader can't see: a drawing's own
// point counts, path data, and finite numbers are schema.ts's); and a drawing's fill and stroke are #rrggbb, none, or a
// palette colour of the scene's look (RV3; a negative stroke width is the loader's). A stand-in's own colours are RI4's
// references, and while the scene's look doesn't resolve, RI4 stands and RV3 waits for it. No reason holds a value
// from the data.
import { HEX } from "../schema";
import type { Context, Family } from "./family";

/** The most points a 2D polygon or polyline holds (§4.2). */
export const MAX_POINTS = 256;

/** RV1, RV2's derived polygons, and RV3, for each piece of the catalog. */
export const rv: Family = (ctx: Context) => {
  const scene = ctx.room.scene?.value;
  const look = scene && ctx.room.looks.find((l) => l.value.id === scene.look)?.value;
  for (const c of ctx.room.catalog) {
    const drawing = c.value.drawing;
    if (drawing === undefined) {
      ctx.report("RV1", c.file, "drawing", "no drawing, so its placements and poses would have none in 2D");
      continue;
    }
    if (drawing.primitives?.length === 0)
      ctx.report(
        "RV1",
        c.file,
        "drawing.primitives",
        "no primitive, so its placements and poses would draw nothing in 2D",
      );
    if (drawing.from === "standin")
      c.value.standin.forEach((shape, k) => {
        if (shape.shape === "polygon" && shape.points.length > MAX_POINTS)
          ctx.report(
            "RV2",
            c.file,
            ctx.path("standin", k, "points"),
            `${shape.points.length} points, more than the ${MAX_POINTS} of the polygon the drawing derives from it`,
          );
      });
    if (!look) continue;
    drawing.primitives?.forEach((primitive, k) => {
      for (const key of ["fill", "stroke"] as const) {
        const colour = primitive[key];
        if (colour !== "none" && !HEX.test(colour) && !Object.hasOwn(look.palette, colour))
          ctx.report(
            "RV3",
            c.file,
            ctx.path("drawing", "primitives", k, key),
            "neither #rrggbb, none, nor a palette colour of the scene's look",
          );
      }
    });
  }
};
