import type { BrushConfig, BrushParamConfig, BrushStrokePoint } from "../types";
import type { RandomFn } from "../../utils/random";
import { applyProfile } from "../../profiles";

/** A stamp's final size, rotation, offset and alpha after variation */
export interface StampParams {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Rotation in degrees */
  rotation: number;
  /** Horizontal offset from the stroke point, in pixels */
  offsetX: number;
  /** Vertical offset from the stroke point, in pixels */
  offsetY: number;
  /** Alpha (0–1) */
  alpha: number;
}

/** What the input device reports for a point */
export interface PointInput {
  /** Pressure (0–1), only meaningful for pens */
  pressure?: number;
  /** Tilt in degrees along X and Y (-90–90), only meaningful for pens */
  tiltX?: number;
  tiltY?: number;
  /** Whether the point came from a pen (mouse and touch report no real pressure or tilt) */
  isPen: boolean;
}

/**
 * Linear interpolation between two values.
 *
 * @example
 * lerp(0, 10, 0.25); // 2.5
 */
export const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

/**
 * Clamp a value between 0 and 1.
 */
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * How far the pen leans: 0 when upright, 1 when flat.
 *
 * @example
 * tiltAmount(0, 0); // 0
 * tiltAmount(90, 0); // 1
 */
export const tiltAmount = (tiltX = 0, tiltY = 0): number =>
  clamp01(Math.hypot(tiltX, tiltY) / 90);

/**
 * The direction the pen leans, in degrees (0 = towards +X, 90 = towards +Y).
 *
 * @example
 * tiltDirection(0, 45); // 90
 */
export const tiltDirection = (tiltX = 0, tiltY = 0): number =>
  (Math.atan2(tiltY, tiltX) * 180) / Math.PI;

/**
 * Combine a parameter's randomise, pressure and tilt factors into one factor (they multiply). Returns 1 when nothing is enabled.
 * Pressure and tilt only apply to pens; for other devices they count as full (`maxPressure`/`maxTilt`). Each input goes
 * through the parameter's profile graph (see `applyProfile`) before it sets the factor between its min and max.
 *
 * @example
 * variationFactor({ useRandomise: true, minRandomise: 0.5, maxRandomise: 1 }, { isPen: false }, () => 0); // 0.5
 */
export const variationFactor = (
  config: BrushParamConfig | undefined,
  input: PointInput,
  random: RandomFn = Math.random,
): number => {
  if (!config) return 1;
  const { profile } = config;
  let factor = 1;
  if (config.useRandomise) {
    factor *= lerp(
      config.minRandomise ?? 1,
      config.maxRandomise ?? 1,
      applyProfile(profile, random()),
    );
  }
  if (config.usePressure) {
    const pressure = input.isPen ? clamp01(input.pressure ?? 1) : 1;
    factor *= lerp(
      config.minPressure ?? 0,
      config.maxPressure ?? 1,
      applyProfile(profile, pressure),
    );
  }
  if (config.useTilt) {
    const tilt = input.isPen ? tiltAmount(input.tiltX, input.tiltY) : 1;
    factor *= lerp(
      config.minTilt ?? 0,
      config.maxTilt ?? 1,
      applyProfile(profile, tilt),
    );
  }
  return factor;
};

/** Whether the user wants pen pressure and tilt to vary strokes, whatever the preset says */
export interface PenInputSettings {
  /** Pressure varies the width and height */
  penPressure: boolean;
  /** Tilt turns the stamp to the pen's lean (and varies the width and height where the preset gives a tilt range) */
  penTilt: boolean;
}

/** The size settings varied by pen pressure and tilt */
const PEN_SIZE_PARAMS = ["widthConfig", "heightConfig"] as const;

/**
 * A preset with the user's pen pressure and tilt settings applied, which win over the preset's own:
 *
 * - Pressure on: the width and height vary with pressure, using the preset's range and graph where it varies them with
 *   pressure, or the full range (0–1) otherwise. Off: they don't vary with pressure.
 * - Tilt on: the rotation follows the pen's lean, and the width and height vary with tilt where the preset varies them
 *   with tilt (a full range would leave nothing drawn with an upright pen). Off: nothing varies with tilt.
 *
 * Other settings (e.g. alpha) keep the preset's pressure and tilt.
 *
 * @example
 * withPenInput({ widthConfig: {} }, { penPressure: true, penTilt: false }).widthConfig;
 * // { usePressure: true, minPressure: 0, maxPressure: 1, useTilt: false }
 */
export const withPenInput = (
  preset: BrushConfig,
  { penPressure, penTilt }: PenInputSettings,
): BrushConfig => {
  const result: BrushConfig = {
    ...preset,
    rotationConfig: { ...preset.rotationConfig, useTilt: penTilt },
  };
  for (const param of PEN_SIZE_PARAMS) {
    const config = preset[param];
    result[param] = {
      ...config,
      usePressure: penPressure,
      // The full range when the preset doesn't give one
      ...(penPressure && !config?.usePressure
        ? { minPressure: 0, maxPressure: 1 }
        : {}),
      useTilt: penTilt && Boolean(config?.useTilt),
    };
  }
  return result;
};

/**
 * Work out one stamp's size, rotation, offset and alpha from the preset, the user's chosen size and the input at that point.
 *
 * - Size and alpha are scaled by their factor.
 * - Rotation adds `factor × 360°`; with `useTilt`, it follows the pen's lean direction instead.
 * - Offsets scatter up to `factor × size` in a random direction.
 *
 * @example
 * stampParams(preset, { width: 20, height: 20 }, { isPen: true, pressure: 0.5 });
 */
export const stampParams = (
  preset: BrushConfig,
  size: { width: number; height: number },
  input: PointInput,
  random: RandomFn = Math.random,
): StampParams => {
  const width = Math.max(
    0,
    size.width * variationFactor(preset.widthConfig, input, random),
  );
  const height = preset.constrainProportions
    ? (width * size.height) / size.width
    : Math.max(
        0,
        size.height * variationFactor(preset.heightConfig, input, random),
      );

  let rotation = preset.rotation ?? 0;
  const rotationConfig = preset.rotationConfig;
  if (
    rotationConfig?.useTilt &&
    input.isPen &&
    tiltAmount(input.tiltX, input.tiltY) > 0
  ) {
    rotation += tiltDirection(input.tiltX, input.tiltY);
  } else if (rotationConfig?.useRandomise || rotationConfig?.usePressure) {
    rotation +=
      variationFactor({ ...rotationConfig, useTilt: false }, input, random) *
      360;
  }

  /** Base offset plus a scatter of up to `factor × extent` in a random direction */
  const scatter = (
    base: number | undefined,
    config: BrushParamConfig | undefined,
    extent: number,
  ) => {
    if (!config?.useRandomise && !config?.usePressure && !config?.useTilt)
      return base ?? 0;
    const direction = random() < 0.5 ? -1 : 1;
    return (
      (base ?? 0) + direction * variationFactor(config, input, random) * extent
    );
  };

  return {
    width,
    height,
    rotation,
    offsetX: scatter(preset.offsetX, preset.offsetXConfig, width),
    offsetY: scatter(preset.offsetY, preset.offsetYConfig, height),
    alpha: clamp01(
      (preset.alpha ?? 1) * variationFactor(preset.alphaConfig, input, random),
    ),
  };
};

/** An area on whole pixels, given by its centre and size */
export interface PixelArea {
  /** Centre X, in pixels */
  x: number;
  /** Centre Y, in pixels */
  y: number;
  /** Width in whole pixels */
  width: number;
  /** Height in whole pixels */
  height: number;
}

/**
 * Round a size to whole pixels: at least 1 pixel unless it is 0 or less (nothing is drawn).
 */
const wholePixels = (size: number): number =>
  size > 0 ? Math.max(1, Math.round(size)) : 0;

/**
 * Move an area centred on a point onto whole pixels. The size is rounded to whole pixels and the top-left corner is
 * rounded down, so the pixel under the point is always covered.
 *
 * @example
 * snapToPixelGrid(10.7, 4.2, 1, 1); // { x: 10.5, y: 4.5, width: 1, height: 1 }: the pixel at (10, 4)
 * snapToPixelGrid(10.7, 4.2, 2, 2); // { x: 10, y: 4, width: 2, height: 2 }: pixels 9–10 and 3–4
 */
export const snapToPixelGrid = (
  x: number,
  y: number,
  width: number,
  height: number,
): PixelArea => {
  const snappedWidth = wholePixels(width);
  const snappedHeight = wholePixels(height);
  const left = Math.floor(x) - Math.floor(snappedWidth / 2);
  const top = Math.floor(y) - Math.floor(snappedHeight / 2);
  return {
    x: left + snappedWidth / 2,
    y: top + snappedHeight / 2,
    width: snappedWidth,
    height: snappedHeight,
  };
};

/**
 * Move a stamp onto whole pixels (see {@link snapToPixelGrid}). Its offset is included in the returned point, so the
 * returned params have no offset.
 *
 * @example
 * snapStamp(10.7, 4.2, { width: 1, height: 1, rotation: 0, offsetX: 2, offsetY: 0, alpha: 1 });
 * // { x: 12.5, y: 4.5, params: { width: 1, height: 1, rotation: 0, offsetX: 0, offsetY: 0, alpha: 1 } }
 */
export const snapStamp = (
  x: number,
  y: number,
  params: StampParams,
): { x: number; y: number; params: StampParams } => {
  const area = snapToPixelGrid(
    x + params.offsetX,
    y + params.offsetY,
    params.width,
    params.height,
  );
  return {
    x: area.x,
    y: area.y,
    params: {
      ...params,
      width: area.width,
      height: area.height,
      offsetX: 0,
      offsetY: 0,
    },
  };
};

/**
 * Describe a stroke point's input for parameter variation.
 */
export const pointInput = (
  point: BrushStrokePoint,
  isPen: boolean,
): PointInput => ({
  pressure: point.pressure,
  tiltX: point.tiltX,
  tiltY: point.tiltY,
  isPen,
});
