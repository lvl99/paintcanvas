import { BUILT_IN_AUTHOR } from "../../authors";
import type { BrushConfig, BrushesConfig } from "../../types";
import { SmoothingType } from "../../types";
import { sizedPresets, spacedBy } from "../sized";
import TEXTURED_PAINT_IMAGE from "./textured-paint.png?inline";
import WATERY_PAINT_IMAGE from "./watery-paint.png?inline";
import SPLATTER_IMAGE from "./splatter.png?inline";
import HAIR_IMAGE from "./hair.png?inline";
import GRASS_IMAGE from "./grass.png?inline";

/** Settings shared by the paint and texture presets */
const DEFAULT_CONFIG: Partial<BrushConfig> = {
  version: "1.0.0",
  author: BUILT_IN_AUTHOR,
  constrainProportions: true,
  sampleRate: 5,
  smoothingType: SmoothingType.BezierCubic,
};

/** A random factor from `min` to `max` for each stamp */
const randomise = (min: number, max: number) => ({
  useRandomise: true,
  minRandomise: min,
  maxRandomise: max,
});

const TEN_TO_A_HUNDRED = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Thick paint whose bristles leave streaks along the stroke, narrower with lighter pen pressure */
export const texturedPaint: BrushesConfig = sizedPresets(
  "texturedPaint",
  "Textured paint",
  [5, 10, 20, 30, 40, 50, 100],
  {
    ...DEFAULT_CONFIG,
    image: TEXTURED_PAINT_IMAGE,
    alpha: 0.9,
    widthConfig: { usePressure: true, minPressure: 0.6, maxPressure: 1 },
  },
  spacedBy(0.04),
);

/**
 * Watercolour-like washes: faint, uneven stamps that build up where they overlap. Stamps can't mix colours or run, so
 * this only imitates the look.
 */
export const wateryPaint: BrushesConfig = sizedPresets(
  "wateryPaint",
  "Watery paint",
  [5, 10, 20, 30, 40, 50],
  {
    ...DEFAULT_CONFIG,
    image: WATERY_PAINT_IMAGE,
    alpha: 0.2,
    alphaConfig: randomise(0.6, 1),
    widthConfig: randomise(0.9, 1),
    rotationConfig: randomise(0, 1),
  },
  spacedBy(0.15),
);

/** Splashes of paint, scattered and turned at random */
export const splatter: BrushesConfig = sizedPresets(
  "splatter",
  "Splatter",
  [50, 100, 150],
  {
    ...DEFAULT_CONFIG,
    image: SPLATTER_IMAGE,
    sampleRate: 30,
    smoothingType: SmoothingType.Linear,
    widthConfig: randomise(0.5, 1),
    rotationConfig: randomise(0, 1),
    offsetXConfig: randomise(0, 0.4),
    offsetYConfig: randomise(0, 0.4),
  },
  spacedBy(0.9),
);

/** Fine parallel strands, for hair and fur */
export const hair: BrushesConfig = sizedPresets(
  "hair",
  "Hair",
  TEN_TO_A_HUNDRED,
  {
    ...DEFAULT_CONFIG,
    image: HAIR_IMAGE,
    alpha: 0.85,
    widthConfig: { usePressure: true, minPressure: 0.7, maxPressure: 1 },
  },
  spacedBy(0.02),
);

/** Tufts of grass, leaning a little to either side and scattered along the stroke */
export const grass: BrushesConfig = sizedPresets(
  "grass",
  "Grass",
  TEN_TO_A_HUNDRED,
  {
    ...DEFAULT_CONFIG,
    image: GRASS_IMAGE,
    sampleRate: 20,
    smoothingType: SmoothingType.Linear,
    // Turns each tuft between -10° and +12°
    rotation: -10,
    rotationConfig: randomise(0, 0.06),
    widthConfig: randomise(0.6, 1),
    offsetXConfig: randomise(0, 0.25),
  },
  spacedBy(0.35),
);

export default {
  ...texturedPaint,
  ...wateryPaint,
  ...splatter,
  ...hair,
  ...grass,
} satisfies BrushesConfig;
