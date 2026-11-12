import type { BrushesConfig, BrushPreset } from "../../types";
import { SmoothingType } from "../../types";
import { builtInPreset } from "../sized";

/** Header shared by the sketching presets */
const HEADER = { group: "Sketching", version: "1.0.0" };

/** Thin pencil that gets wider and darker with pen pressure */
export const pencil: BrushPreset = builtInPreset(
  { ...HEADER, id: "pencil", name: "Pencil 4px (pressure)" },
  {
    width: 4,
    height: 4,
    constrainProportions: true,
    alpha: 0.9,
    spacing: 1,
    sampleRate: 10,
    smoothingType: SmoothingType.BezierCubic,
    widthConfig: { usePressure: true, minPressure: 0.3, maxPressure: 1 },
  },
);

/** Ink pen with strong pressure taper */
export const inkPen: BrushPreset = builtInPreset(
  { ...HEADER, id: "inkPen", name: "Ink pen 10px (pressure)" },
  {
    width: 10,
    height: 10,
    constrainProportions: true,
    spacing: 1,
    sampleRate: 10,
    smoothingType: SmoothingType.BezierCubic,
    widthConfig: { usePressure: true, minPressure: 0.1, maxPressure: 1 },
  },
);

/** Scattered dots of varying size, for texture */
export const stipple: BrushPreset = builtInPreset(
  { ...HEADER, id: "stipple", name: "Stipple 8px" },
  {
    width: 8,
    height: 8,
    constrainProportions: true,
    spacing: 14,
    sampleRate: 10,
    smoothingType: SmoothingType.Linear,
    widthConfig: { useRandomise: true, minRandomise: 0.3, maxRandomise: 1 },
    offsetXConfig: { useRandomise: true, minRandomise: 0, maxRandomise: 1 },
    offsetYConfig: { useRandomise: true, minRandomise: 0, maxRandomise: 1 },
  },
);

/** Flat angled nib; with a pen, the angle follows the pen's tilt */
export const calligraphy: BrushPreset = builtInPreset(
  { ...HEADER, id: "calligraphy", name: "Calligraphy 24px (tilt)" },
  {
    width: 24,
    height: 5,
    constrainProportions: true,
    rotation: 45,
    spacing: 1,
    sampleRate: 10,
    smoothingType: SmoothingType.BezierCubic,
    rotationConfig: { useTilt: true },
  },
);

/** Semi-transparent marker: overlapping parts of one stroke stay even, separate strokes build up */
export const marker: BrushPreset = builtInPreset(
  { ...HEADER, id: "marker", name: "Marker 30px 40%" },
  {
    width: 30,
    height: 30,
    constrainProportions: true,
    alpha: 0.4,
    spacing: 2,
    sampleRate: 10,
    smoothingType: SmoothingType.BezierQuad,
  },
);

/** Presets for sketching and for testing how drawing feels */
export const sketching: BrushesConfig = {
  pencil,
  inkPen,
  stipple,
  calligraphy,
  marker,
};

export default sketching;
