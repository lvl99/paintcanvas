import { BUILT_IN_AUTHOR } from "../../authors";
import type { BrushConfig, BrushesConfig } from "../../types";
import { sizedPresets } from "../sized";
import ROUND_IMAGE from "./round.png?inline";
import SOFT_ROUND_IMAGE from "./soft-round.png?inline";

/** Settings shared by the round presets */
const DEFAULT_CONFIG: Partial<BrushConfig> = {
  version: "1.0.0",
  author: BUILT_IN_AUTHOR,
  constrainProportions: true,
};

/** Hard round brushes */
export const round: BrushesConfig = sizedPresets(
  "round",
  "Round",
  [1, 5, 10, 20, 50],
  { ...DEFAULT_CONFIG, image: ROUND_IMAGE, sampleRate: 20, spacing: 1 },
);

/** Soft-edged round brushes, for shading. Stamps are about a quarter of the size apart: closer, the soft edges add up and look hard. */
export const softRound: BrushesConfig = sizedPresets(
  "softRound",
  "Soft round",
  [5, 10, 20, 30, 40, 50, 100, 150],
  { ...DEFAULT_CONFIG, image: SOFT_ROUND_IMAGE, sampleRate: 5 },
  (size) => ({ spacing: Math.max(1, Math.round(size / 4)) }),
);

export default { ...round, ...softRound } satisfies BrushesConfig;
