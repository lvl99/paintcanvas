import {
  SmoothingType,
  type BrushConfig,
  type BrushesConfig,
} from "../../types";
import { sizedPresets } from "../sized";
import SQUARE_IMAGE from "./square.png?inline";

/** Version of these presets */
const VERSION = "1.1.0";

/** Settings shared by the round, square and soft round presets */
const DEFAULT_CONFIG: BrushConfig = {
  constrainProportions: true,
};

/** Hard square brushes, snapped to the pixel grid */
export const square: BrushesConfig = sizedPresets(
  { idPrefix: "square", name: "Square", version: VERSION },
  [1, 5, 10, 20, 30, 40, 50, 100, 150],
  {
    ...DEFAULT_CONFIG,
    image: SQUARE_IMAGE,
    smoothingType: SmoothingType.BezierCubic,
    sampleRate: 5,
    snapToPixelGrid: true,
  },
  (size) => ({ spacing: Math.max(1, Math.round(size / 10)) }),
);

export default { ...square } satisfies BrushesConfig;
