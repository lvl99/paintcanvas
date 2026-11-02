import { BUILT_IN_AUTHOR } from "../../authors";
import type { BrushConfig, BrushesConfig } from "../../types";
import { SmoothingType } from "../../types";

/** Settings shared by the sketching presets */
const DEFAULT_CONFIG: Partial<BrushConfig> = {
  version: "1.0.0",
  author: BUILT_IN_AUTHOR,
  group: "Sketching",
};

/** Thin pencil that gets wider and darker with pen pressure */
export const pencil: BrushConfig = {
  ...DEFAULT_CONFIG,
  id: "pencil",
  name: "Pencil 4px (pressure)",
  width: 4,
  height: 4,
  constrainProportions: true,
  alpha: 0.9,
  spacing: 1,
  sampleRate: 10,
  smoothingType: SmoothingType.BezierCubic,
  widthConfig: { usePressure: true, minPressure: 0.3, maxPressure: 1 },
};

/** Ink pen with strong pressure taper */
export const inkPen: BrushConfig = {
  ...DEFAULT_CONFIG,
  id: "inkPen",
  name: "Ink pen 10px (pressure)",
  width: 10,
  height: 10,
  constrainProportions: true,
  spacing: 1,
  sampleRate: 10,
  smoothingType: SmoothingType.BezierCubic,
  widthConfig: { usePressure: true, minPressure: 0.1, maxPressure: 1 },
};

/** Scattered dots of varying size, for texture */
export const stipple: BrushConfig = {
  ...DEFAULT_CONFIG,
  id: "stipple",
  name: "Stipple 8px",
  width: 8,
  height: 8,
  constrainProportions: true,
  spacing: 14,
  sampleRate: 10,
  smoothingType: SmoothingType.Linear,
  widthConfig: { useRandomise: true, minRandomise: 0.3, maxRandomise: 1 },
  offsetXConfig: { useRandomise: true, minRandomise: 0, maxRandomise: 1 },
  offsetYConfig: { useRandomise: true, minRandomise: 0, maxRandomise: 1 },
};

/** Flat angled nib; with a pen, the angle follows the pen's tilt */
export const calligraphy: BrushConfig = {
  ...DEFAULT_CONFIG,
  id: "calligraphy",
  name: "Calligraphy 24px (tilt)",
  width: 24,
  height: 5,
  constrainProportions: true,
  rotation: 45,
  spacing: 1,
  sampleRate: 10,
  smoothingType: SmoothingType.BezierCubic,
  rotationConfig: { useTilt: true },
};

/** Semi-transparent marker: overlapping parts of one stroke stay even, separate strokes build up */
export const marker: BrushConfig = {
  ...DEFAULT_CONFIG,
  id: "marker",
  name: "Marker 30px 40%",
  width: 30,
  height: 30,
  constrainProportions: true,
  alpha: 0.4,
  spacing: 2,
  sampleRate: 10,
  smoothingType: SmoothingType.BezierQuad,
};

/** Presets for sketching and for testing how drawing feels */
export const sketching: BrushesConfig = {
  pencil,
  inkPen,
  stipple,
  calligraphy,
  marker,
};

export default sketching;
