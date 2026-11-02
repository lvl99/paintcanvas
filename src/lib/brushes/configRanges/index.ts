import type { BrushConfig, BrushParamConfig } from "../types";

/** The brush settings the configuration window can vary with pressure, tilt or randomness */
export type VaryingParam =
  "width" | "height" | "alpha" | "rotation" | "offsetX" | "offsetY";

/** What a setting can vary with */
export type VariationSource = "pressure" | "tilt" | "randomise";

/** All variation sources, in the order they are shown */
export const VARIATION_SOURCES: readonly VariationSource[] = [
  "pressure",
  "tilt",
  "randomise",
];

/** A setting as the configuration window shows it, in its unit (pixels, percent or degrees) */
export interface ParamRange {
  /** The setting's value when it doesn't vary */
  value: number;
  /** Lowest value when it varies */
  min: number;
  /** Highest value when it varies */
  max: number;
  /** Which sources it varies with */
  sources: Record<VariationSource, boolean>;
  /** Whether it varies with any source */
  varies: boolean;
}

/** Each setting's unit range in the window */
export const PARAM_LIMITS: Record<VaryingParam, { min: number; max: number }> =
  {
    width: { min: 1, max: 256 },
    height: { min: 1, max: 256 },
    alpha: { min: 0, max: 100 },
    rotation: { min: 0, max: 360 },
    offsetX: { min: 0, max: 256 },
    offsetY: { min: 0, max: 256 },
  };

/** How settings are varied (see `BrushParamConfig`) */
const KINDS: Record<VaryingParam, "scale" | "angle" | "offset"> = {
  width: "scale",
  height: "scale",
  alpha: "scale",
  rotation: "angle",
  offsetX: "offset",
  offsetY: "offset",
};

/** The config keys of each source's switch and range */
const SOURCE_KEYS = {
  pressure: ["usePressure", "minPressure", "maxPressure"],
  tilt: ["useTilt", "minTilt", "maxTilt"],
  randomise: ["useRandomise", "minRandomise", "maxRandomise"],
} as const satisfies Record<
  VariationSource,
  readonly (keyof BrushParamConfig)[]
>;

/** Each source's range when not set (see `BrushParamConfig`) */
const SOURCE_DEFAULTS: Record<VariationSource, [number, number]> = {
  pressure: [0, 1],
  tilt: [0, 1],
  randomise: [1, 1],
};

const configKey = (param: VaryingParam) =>
  `${param}Config` as `${VaryingParam}Config`;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** A setting's value as stored (alpha as 0–1) */
const storedValue = (config: BrushConfig, param: VaryingParam): number => {
  if (param === "alpha") return config.alpha ?? 1;
  if (param === "width") return config.width ?? 1;
  if (param === "height") return config.height ?? config.width ?? 1;
  return config[param] ?? 0;
};

/** A stored value in the window's unit */
const toUnit = (param: VaryingParam, value: number) =>
  param === "alpha" ? value * 100 : value;

/** A value in the window's unit as stored */
const fromUnit = (param: VaryingParam, value: number) =>
  param === "alpha" ? value / 100 : value;

/**
 * Read a setting as the configuration window shows it. When it varies, its range comes from the first source turned
 * on: scale settings (width, height, opacity) go from `value × min factor` to the value; rotation goes from the angle
 * to the angle plus up to 360° × the factors; offsets scatter up to the factors × the brush width.
 *
 * @example
 * readRange({ id: "a", width: 40, widthConfig: { usePressure: true, minPressure: 0.25 } }, "width");
 * // { value: 40, min: 10, max: 40, sources: { pressure: true, tilt: false, randomise: false }, varies: true }
 */
export const readRange = (
  config: BrushConfig,
  param: VaryingParam,
): ParamRange => {
  const variation = config[configKey(param)] ?? {};
  const sources = Object.fromEntries(
    VARIATION_SOURCES.map((source) => [
      source,
      Boolean(variation[SOURCE_KEYS[source][0]]),
    ]),
  ) as Record<VariationSource, boolean>;
  const first = VARIATION_SOURCES.find((source) => sources[source]);
  const value = toUnit(param, storedValue(config, param));
  if (!first) return { value, min: value, max: value, sources, varies: false };
  const [, minKey, maxKey] = SOURCE_KEYS[first];
  const [minDefault, maxDefault] = SOURCE_DEFAULTS[first];
  const low = variation[minKey] ?? minDefault;
  const high = variation[maxKey] ?? maxDefault;
  const width = config.width ?? 1;
  switch (KINDS[param]) {
    case "scale":
      return {
        value,
        min: value * low,
        max: value * high,
        sources,
        varies: true,
      };
    case "angle":
      return {
        value,
        min: value + low * 360,
        max: value + high * 360,
        sources,
        varies: true,
      };
    default:
      return {
        value,
        min: low * width,
        max: high * width,
        sources,
        varies: true,
      };
  }
};

/**
 * Write a setting's range (in the window's unit) to every source turned on, as config changes. For a setting that
 * doesn't vary, only `value` is used.
 *
 * @example
 * writeRange(config, "width", { min: 10, max: 40 }); // { width: 40, widthConfig: { usePressure: true, minPressure: 0.25, maxPressure: 1 } }
 */
export const writeRange = (
  config: BrushConfig,
  param: VaryingParam,
  range: { value?: number; min?: number; max?: number },
): Partial<BrushConfig> => {
  const current = readRange(config, param);
  const limits = PARAM_LIMITS[param];
  if (!current.varies) {
    const value = clamp(range.value ?? current.value, limits.min, limits.max);
    return KINDS[param] === "offset" ? {} : { [param]: fromUnit(param, value) };
  }
  let min = clamp(range.min ?? current.min, limits.min, limits.max);
  let max = clamp(range.max ?? current.max, limits.min, limits.max);
  if (min > max) [min, max] = [max, min];
  const width = config.width ?? 1;
  let changes: Partial<BrushConfig>;
  let factors: [number, number];
  switch (KINDS[param]) {
    case "scale":
      changes = { [param]: fromUnit(param, Math.max(max, limits.min || 1e-6)) };
      factors = [max > 0 ? min / max : 0, 1];
      break;
    case "angle":
      changes = { rotation: min };
      factors = [0, (max - min) / 360];
      break;
    default:
      changes = {};
      factors = [clamp(min / width, 0, 1), clamp(max / width, 0, 1)];
  }
  const variation = { ...config[configKey(param)] };
  for (const source of VARIATION_SOURCES) {
    if (!current.sources[source]) continue;
    const [, minKey, maxKey] = SOURCE_KEYS[source];
    variation[minKey] = factors[0];
    variation[maxKey] = factors[1];
  }
  return { ...changes, [configKey(param)]: variation };
};

/**
 * Turn a source on or off for a setting, as config changes. A source turned on takes the setting's current range, or
 * when it is the first, a starting range (half to full size, the angle itself, or no scatter).
 */
export const toggleSource = (
  config: BrushConfig,
  param: VaryingParam,
  source: VariationSource,
  on: boolean,
): Partial<BrushConfig> => {
  const key = configKey(param);
  const [useKey, minKey, maxKey] = SOURCE_KEYS[source];
  const current = readRange(config, param);
  const variation: BrushParamConfig = { ...config[key], [useKey]: on };
  if (on && !current.varies) {
    const starting: Record<(typeof KINDS)[VaryingParam], [number, number]> = {
      scale: [0.5, 1],
      angle: [0, 0],
      offset: [0, 0.5],
    };
    [variation[minKey], variation[maxKey]] = starting[KINDS[param]];
    return { [key]: variation };
  }
  if (on) {
    const updated = { ...config, [key]: variation };
    return writeRange(updated, param, { min: current.min, max: current.max });
  }
  return { [key]: variation };
};
