import {
  SmoothingType,
  type BrushConfig,
  type BrushesConfig,
} from "../../types";
import { sizedPresets } from "../sized";
import ROUND_IMAGE from "./round.png?inline";
import SOFT_ROUND_IMAGE from "./soft-round.png?inline";

/** Version of these presets */
const VERSION = "1.1.0";

/** Settings shared by the round presets */
const DEFAULT_CONFIG: BrushConfig = {
  constrainProportions: true,
  smoothingType: SmoothingType.BezierCubic,
  sampleRate: 5,
};

/** Hard round brushes */
export const round: BrushesConfig = sizedPresets(
  { idPrefix: "round", name: "Round", version: VERSION },
  [1, 5, 10, 20, 30, 40, 50, 100, 150],
  {
    ...DEFAULT_CONFIG,
    image: ROUND_IMAGE,
    spacing: 1,
  },
  (size) => (size === 1 ? { snapToPixelGrid: true } : {}),
);

/** Soft-edged round brushes, for shading. Stamps are about a quarter of the size apart: closer, the soft edges add up and look hard. */
export const softRound: BrushesConfig = sizedPresets(
  { idPrefix: "softRound", name: "Soft round", version: VERSION },
  [5, 10, 20, 30, 40, 50, 100, 150],
  {
    ...DEFAULT_CONFIG,
    image: SOFT_ROUND_IMAGE,
  },
  (size) => ({ spacing: Math.max(1, Math.round(size / 4)) }),
);

export default { ...round, ...softRound } satisfies BrushesConfig;
