import { BUILT_IN_AUTHOR } from "../../authors";
import type { BrushConfig, BrushesConfig } from "../../types";
import { SmoothingType } from "../../types";
import { sizedPresets, spacedBy } from "../sized";
import PENCIL_2B_IMAGE from "./pencil-2b.png?inline";
import PENCIL_HB_IMAGE from "./pencil-hb.png?inline";
import FELT_PEN_IMAGE from "./felt-pen.png?inline";
import BRUSH_PEN_IMAGE from "./brush-pen.png?inline";

/** Settings shared by the pencil and pen presets */
const DEFAULT_CONFIG: Partial<BrushConfig> = {
  version: "1.0.0",
  author: BUILT_IN_AUTHOR,
  constrainProportions: true,
  sampleRate: 5,
  smoothingType: SmoothingType.BezierCubic,
};

/**
 * Pencil settings: graphite grain turned at random for each stamp, so it doesn't repeat, and lines that get wider and
 * darker with pen pressure.
 */
const pencil = (image: string, alpha: number): Partial<BrushConfig> => ({
  ...DEFAULT_CONFIG,
  image,
  alpha,
  rotationConfig: { useRandomise: true, minRandomise: 0, maxRandomise: 1 },
  widthConfig: { usePressure: true, minPressure: 0.5, maxPressure: 1 },
  alphaConfig: { usePressure: true, minPressure: 0.4, maxPressure: 1 },
});

const PENCIL_SIZES = [1, 5, 10, 20, 30, 40, 50];

const PEN_SIZES = [5, 10, 15, 20, 30, 40, 50];

/** Soft, dark pencils */
export const pencil2b: BrushesConfig = sizedPresets(
  "pencil2b",
  "2B Pencil",
  PENCIL_SIZES,
  pencil(PENCIL_2B_IMAGE, 0.9),
  spacedBy(0.25),
);

/** Hard, light pencils */
export const pencilHb: BrushesConfig = sizedPresets(
  "pencilHb",
  "HB Pencil",
  PENCIL_SIZES,
  pencil(PENCIL_HB_IMAGE, 0.6),
  spacedBy(0.25),
);

/** Felt pens: even, nearly solid lines */
export const feltPen: BrushesConfig = sizedPresets(
  "feltPen",
  "Felt pen",
  PEN_SIZES,
  {
    ...DEFAULT_CONFIG,
    image: FELT_PEN_IMAGE,
    alpha: 0.9,
    smoothingType: SmoothingType.BezierQuad,
  },
  spacedBy(0.05),
);

/** Brush pens: an angled oval tip, so lines are thicker in one direction, tapering with pen pressure */
export const brushPen: BrushesConfig = sizedPresets(
  "brushPen",
  "Brush pen",
  PEN_SIZES,
  {
    ...DEFAULT_CONFIG,
    image: BRUSH_PEN_IMAGE,
    rotation: -30,
    spacing: 1,
    widthConfig: { usePressure: true, minPressure: 0.15, maxPressure: 1 },
  },
);

export default {
  ...pencil2b,
  ...pencilHb,
  ...feltPen,
  ...brushPen,
} satisfies BrushesConfig;
