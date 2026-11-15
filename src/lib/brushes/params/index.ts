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

/** Each source's switch, range keys and range when not set (see `BrushParamConfig`) */
const SOURCES = [
  ["useRandomise", "minRandomise", "maxRandomise", "randomiseProfile", 1, 1],
  ["usePressure", "minPressure", "maxPressure", "pressureProfile", 0, 1],
  ["useTilt", "minTilt", "maxTilt", "tiltProfile", 0, 1],
] as const;

/** A source's input: a random number, or the pen's pressure or tilt (full for other devices) */
const sourceInput = (
  useKey: (typeof SOURCES)[number][0],
  input: PointInput,
  random: RandomFn,
): number => {
  if (useKey === "useRandomise") return random();
  if (!input.isPen) return 1;
  return useKey === "usePressure"
    ? clamp01(input.pressure ?? 1)
    : tiltAmount(input.tiltX, input.tiltY);
};

/**
 * Combine a parameter's randomise, pressure and tilt shares into one (they multiply). Returns 1 when nothing is
 * enabled. Each input goes through the source's own profile graph (or the parameter's, see `applyProfile`) before it
 * sets the share between the source's min and max. Pressure and tilt only apply to pens; for other devices they count
 * as full.
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
  let factor = 1;
  for (const [useKey, minKey, maxKey, profileKey, low, high] of SOURCES) {
    if (!config[useKey]) continue;
    factor *= lerp(
      config[minKey] ?? low,
      config[maxKey] ?? high,
      applyProfile(
        config[profileKey] ?? config.profile,
        sourceInput(useKey, input, random),
      ),
    );
  }
  return factor;
};

/** Whether any source varies a parameter */
const varies = (config: BrushParamConfig | undefined): boolean =>
  Boolean(config?.useRandomise || config?.usePressure || config?.useTilt);

/** Whether a parameter has a range (`min` or `max`), rather than working as before ranges */
const hasRange = (config: BrushParamConfig): boolean =>
  config?.min !== undefined || config?.max !== undefined;

/**
 * Work out one stamp's size, rotation, offset and alpha from the preset, the user's chosen size and the input at that point
 * (see `BrushParamConfig`): each varied parameter's value is as far between its range's ends as its sources' share.
 *
 * - Size and alpha go from `min` × the value to the value.
 * - Rotation goes from the angle + `min` to the angle + `max` degrees (0 to 360 without a range). With
 *   `rotationFollowsLean`, the direction the pen leans is added; without a range, tilt sets that direction instead.
 * - Offsets go from `min` × the size to `max` × the size, added to the offset. Without a range, they scatter up to the
 *   share × the size in a random direction.
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
  /** A scale parameter's factor: from its `min` to 1 */
  const scale = (config: BrushParamConfig | undefined) =>
    lerp(config?.min ?? 0, 1, variationFactor(config, input, random));
  const width = Math.max(0, size.width * scale(preset.widthConfig));
  const height = preset.constrainProportions
    ? (width * size.height) / size.width
    : Math.max(0, size.height * scale(preset.heightConfig));

  let rotation = preset.rotation ?? 0;
  const rotationConfig = preset.rotationConfig ?? {};
  const leaning = input.isPen && tiltAmount(input.tiltX, input.tiltY) > 0;
  if (preset.rotationFollowsLean && leaning)
    rotation += tiltDirection(input.tiltX, input.tiltY);
  if (hasRange(rotationConfig)) {
    if (varies(rotationConfig))
      rotation += lerp(
        rotationConfig.min ?? 0,
        rotationConfig.max ?? 360,
        variationFactor(rotationConfig, input, random),
      );
  } else if (rotationConfig.useTilt && leaning) {
    // Settings saved before ranges: tilt turns the stamp to the pen's lean
    if (!preset.rotationFollowsLean)
      rotation += tiltDirection(input.tiltX, input.tiltY);
  } else if (rotationConfig.useRandomise || rotationConfig.usePressure) {
    rotation +=
      variationFactor({ ...rotationConfig, useTilt: false }, input, random) *
      360;
  }

  /** The offset plus its varied part: within its range, or a scatter in a random direction without one */
  const offset = (
    base: number | undefined,
    config: BrushParamConfig = {},
    extent: number,
  ) => {
    if (!varies(config)) return base ?? 0;
    if (hasRange(config))
      return (
        (base ?? 0) +
        lerp(
          config.min ?? 0,
          config.max ?? 0,
          variationFactor(config, input, random),
        ) *
          extent
      );
    const direction = random() < 0.5 ? -1 : 1;
    return (
      (base ?? 0) + direction * variationFactor(config, input, random) * extent
    );
  };

  return {
    width,
    height,
    rotation,
    offsetX: offset(preset.offsetX, preset.offsetXConfig, width),
    offsetY: offset(preset.offsetY, preset.offsetYConfig, height),
    alpha: clamp01((preset.alpha ?? 1) * scale(preset.alphaConfig)),
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
