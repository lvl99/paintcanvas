import { BUILT_IN_AUTHOR } from "../../authors";
import {
  SmoothingType,
  type BrushConfig,
  type BrushesConfig,
} from "../../types";
import { sizedPresets } from "../sized";
import SQUARE_IMAGE from "./square.png?inline";

/** Settings shared by the round, square and soft round presets */
const DEFAULT_CONFIG: Partial<BrushConfig> = {
  version: "1.1.0",
  author: BUILT_IN_AUTHOR,
  constrainProportions: true,
};

/** Hard square brushes, snapped to the pixel grid */
export const square: BrushesConfig = sizedPresets(
  "square",
  "Square",
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
