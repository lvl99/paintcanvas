// Assets for tests: a brush preset, colour palette or profile graph from just the parts a test cares about.
import type { Asset } from "../lib/assets/schema";
import type { BrushConfig, BrushPreset } from "../lib/brushes/types";
import { BRUSH_PRESET_TYPE } from "../lib/presets/schema";
import { COLOUR_PALETTE_TYPE, type ColourPalette } from "../lib/palette/schema";
import {
  PROFILE_GRAPH_TYPE,
  type ProfileGraph,
  type ProfilePoint,
} from "../lib/profiles";

/** The parts of an asset's header a test can set */
export type TestHeader = Partial<Omit<Asset<unknown>, "content">>;

/**
 * A brush preset with content and any header parts, the rest filled in (a new UUID, the name "Test brush" and the
 * author "Tester").
 *
 * @example
 * testPreset({ width: 10 }, { name: "Big" }); // { "@type": "PaintCanvas/BrushPreset", id: "…", name: "Big", ... }
 */
export const testPreset = (
  content: BrushConfig = {},
  header: TestHeader = {},
): BrushPreset => ({
  "@type": BRUSH_PRESET_TYPE,
  id: crypto.randomUUID(),
  name: "Test brush",
  author: "Tester",
  ...header,
  content,
});

/**
 * A colour palette with colours and any header parts, the rest filled in (see `testPreset`).
 *
 * @example
 * testPalette(["#ff0000"], { name: "Reds" });
 */
export const testPalette = (
  colours: string[] = [],
  header: TestHeader = {},
): ColourPalette => ({
  "@type": COLOUR_PALETTE_TYPE,
  id: crypto.randomUUID(),
  name: "Test palette",
  author: "Tester",
  ...header,
  content: { colours },
});

/**
 * A profile graph with points and any header parts, the rest filled in (see `testPreset`).
 *
 * @example
 * testProfile(linearPoints(), { name: "Soft" });
 */
export const testProfile = (
  points: ProfilePoint[],
  header: TestHeader = {},
): ProfileGraph => ({
  "@type": PROFILE_GRAPH_TYPE,
  id: crypto.randomUUID(),
  name: "Test graph",
  author: "Tester",
  ...header,
  content: { points },
});
