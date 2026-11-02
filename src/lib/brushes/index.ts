import round from "./presets/round";
import square from "./presets/square";
import drawing from "./presets/drawing";
import painting from "./presets/painting";
import sketching from "./presets/sketching";
import type { BrushesConfig } from "./types";

/** All presets, in the order they are listed: round, square and soft round, pencils and pens, paints and textures, then sketching presets */
const allPresets: BrushesConfig = {
  ...round,
  ...square,
  ...drawing,
  ...painting,
  ...sketching,
};

/** Brush presets */
export const brushPresets: BrushesConfig = structuredClone(allPresets);

/** Eraser presets (a separate copy of the brush presets) */
export const eraserPresets: BrushesConfig = structuredClone(allPresets);
