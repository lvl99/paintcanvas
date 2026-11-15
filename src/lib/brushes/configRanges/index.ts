import type { BrushConfig, BrushParamConfig } from "../types";
import type { ProfilePoint } from "../../profiles";

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

/** A pen input a brush setting can vary with */
export type PenSource = "pressure" | "tilt";

/** The settings the tool settings bar's pressure and tilt popovers vary */
export const PEN_PARAMS = [
  "width",
  "height",
  "alpha",
  "rotation",
] as const satisfies readonly VaryingParam[];

/** A source of a setting, as the configuration window shows it */
export interface SourceRange {
  /** Whether it's on */
  on: boolean;
  /** Its range's low end (0–1) */
  min: number;
  /** Its range's high end (0–1) */
  max: number;
  /** Its profile graph (its own, or the setting's shared one from before sources had their own), if not a straight line */
  profile?: ProfilePoint[];
  /** The ID of the profile graph `profile` came from */
  profileId?: string;
}

/** A setting as the configuration window shows it, in its unit (pixels, percent or degrees) */
export interface ParamRange {
  /** The setting's value when it doesn't vary (the range's high end for sizes and opacity) */
  value: number;
  /** The range's low end */
  min: number;
  /** The range's high end */
  max: number;
  /** Each source */
  sources: Record<VariationSource, SourceRange>;
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
    offsetX: { min: -100, max: 100 },
    offsetY: { min: -100, max: 100 },
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

/** The config keys of each source's switch, range and profile graph */
const SOURCE_KEYS = {
  pressure: [
    "usePressure",
    "minPressure",
    "maxPressure",
    "pressureProfile",
    "pressureProfileId",
  ],
  tilt: ["useTilt", "minTilt", "maxTilt", "tiltProfile", "tiltProfileId"],
  randomise: [
    "useRandomise",
    "minRandomise",
    "maxRandomise",
    "randomiseProfile",
    "randomiseProfileId",
  ],
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

/** Each kind of setting's range when not set: as before ranges (see `BrushParamConfig`) */
const RANGE_DEFAULTS: Record<(typeof KINDS)[VaryingParam], [number, number]> = {
  scale: [0, 1],
  angle: [0, 360],
  offset: [0, 0],
};

/** Each kind of setting's range when it starts to vary: half to full size, a full turn, or 10 pixels either way */
const STARTING_RANGES: Record<(typeof KINDS)[VaryingParam], [number, number]> =
  {
    scale: [0.5, 1],
    angle: [0, 360],
    offset: [-10, 10],
  };

/**
 * The config key of a setting's variation.
 *
 * @example
 * configKey("width"); // "widthConfig"
 */
export const configKey = (param: VaryingParam) =>
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
 * Whether a variation turns the rotation to the pen's lean with tilt, as settings saved before ranges did (tilt on, no
 * range)
 */
const leansByTilt = (variation: BrushParamConfig): boolean =>
  Boolean(variation.useTilt) &&
  variation.min === undefined &&
  variation.max === undefined;

/**
 * Whether a brush's stamps follow the direction the pen leans: `rotationFollowsLean`, or tilt turning the rotation in
 * settings saved before ranges.
 *
 * @example
 * followsLean({ rotationConfig: { useTilt: true } }); // true
 */
export const followsLean = (config: BrushConfig): boolean =>
  Boolean(config.rotationFollowsLean) ||
  leansByTilt(config.rotationConfig ?? {});

/**
 * Turn following the pen's lean on or off, as config changes (and tilt off for the rotation, if it followed the lean as
 * in settings saved before ranges).
 *
 * @example
 * setFollowsLean({ rotationConfig: { useTilt: true } }, false); // { rotationFollowsLean: false, rotationConfig: { useTilt: false } }
 */
export const setFollowsLean = (
  config: BrushConfig,
  on: boolean,
): Partial<BrushConfig> => {
  const variation = config.rotationConfig ?? {};
  return {
    rotationFollowsLean: on,
    ...(leansByTilt(variation)
      ? { rotationConfig: { ...variation, useTilt: false } }
      : {}),
  };
};

/** Whether a variation turns any source on */
const anyOn = (variation: BrushParamConfig): boolean =>
  VARIATION_SOURCES.some((source) => variation[SOURCE_KEYS[source][0]]);

/** Read a source of a variation */
const readSource = (
  variation: BrushParamConfig,
  source: VariationSource,
): SourceRange => {
  const [useKey, minKey, maxKey, profileKey, idKey] = SOURCE_KEYS[source];
  const [minDefault, maxDefault] = SOURCE_DEFAULTS[source];
  const own = variation[profileKey] !== undefined;
  return {
    on: Boolean(variation[useKey]),
    min: variation[minKey] ?? minDefault,
    max: variation[maxKey] ?? maxDefault,
    profile: own ? variation[profileKey] : variation.profile,
    profileId: own ? variation[idKey] : variation.profileId,
  };
};

/**
 * Read a setting as the configuration window shows it: its range and each source's (see `BrushParamConfig`). Sizes
 * and opacity go from `min` × the value to the value; rotation from the angle + `min` to + `max` degrees; offsets
 * from the offset + `min` to + `max` pixels.
 *
 * @example
 * readRange({ width: 40, widthConfig: { min: 0.25, usePressure: true } }, "width");
 * // { value: 40, min: 10, max: 40, sources: { pressure: { on: true, min: 0, max: 1 }, … }, varies: true }
 */
export const readRange = (
  config: BrushConfig,
  param: VaryingParam,
): ParamRange => {
  const stored = config[configKey(param)] ?? {};
  // A rotation that follows the pen's lean with tilt (before ranges) shows as following it, without tilt
  const variation =
    param === "rotation" && leansByTilt(stored)
      ? { ...stored, useTilt: false }
      : stored;
  const sources = Object.fromEntries(
    VARIATION_SOURCES.map((source) => [source, readSource(variation, source)]),
  ) as Record<VariationSource, SourceRange>;
  const value = toUnit(param, storedValue(config, param));
  const kind = KINDS[param];
  const [minDefault, maxDefault] = RANGE_DEFAULTS[kind];
  const low = variation.min ?? minDefault;
  const high = variation.max ?? maxDefault;
  const ends: Record<typeof kind, [number, number]> = {
    scale: [value * low, value],
    angle: [value + low, value + high],
    offset: [value + low, value + high],
  };
  const varies = anyOn(variation);
  const [lowest, highest] = varies ? ends[kind] : [value, value];
  // Within the setting's limits (e.g. sizes from 1 pixel, as drawn)
  const limits = PARAM_LIMITS[param];
  const min = clamp(lowest, limits.min, limits.max);
  const max = clamp(highest, limits.min, limits.max);
  return { value, min, max, sources, varies };
};

/**
 * A variation with its range set out, so writing one part keeps the rest as it worked: a setting saved before ranges
 * gets the range it worked with (scale from 0, rotation a full turn, offsets as far as they scattered), and its shared
 * profile graph goes to each source. A rotation that followed the pen's lean with tilt follows it with
 * `rotationFollowsLean` instead.
 */
const withRange = (
  config: BrushConfig,
  param: VaryingParam,
): { variation: BrushParamConfig; changes: Partial<BrushConfig> } => {
  const variation: BrushParamConfig = { ...config[configKey(param)] };
  const changes: Partial<BrushConfig> = {};
  if (param === "rotation" && leansByTilt(variation)) {
    variation.useTilt = false;
    changes.rotationFollowsLean = true;
  }
  if (
    anyOn(variation) &&
    variation.min === undefined &&
    variation.max === undefined
  ) {
    const kind = KINDS[param];
    // Offsets scattered up to the size either way (the width for X, the height for Y), within the limits
    const size = Math.min(
      PARAM_LIMITS[param].max,
      param === "offsetY"
        ? (config.height ?? config.width ?? 1)
        : (config.width ?? 1),
    );
    [variation.min, variation.max] =
      kind === "offset" ? [-size, size] : RANGE_DEFAULTS[kind];
  }
  if (variation.profile !== undefined) {
    for (const source of VARIATION_SOURCES) {
      const [useKey, , , profileKey, idKey] = SOURCE_KEYS[source];
      if (variation[useKey] && variation[profileKey] === undefined) {
        variation[profileKey] = variation.profile;
        variation[idKey] = variation.profileId;
      }
    }
    delete variation.profile;
    delete variation.profileId;
  }
  return { variation, changes };
};

/**
 * Write a setting's range (in the window's unit) as config changes; for a setting that doesn't vary, only `value`.
 * Sizes and opacity take the high end as their value (what the tool settings bar shows) and the low end as a share
 * of it.
 *
 * @example
 * writeRange({ width: 40, widthConfig: { usePressure: true } }, "width", { min: 10, max: 40 });
 * // { width: 40, widthConfig: { usePressure: true, min: 0.25, max: 1 } }
 */
export const writeRange = (
  config: BrushConfig,
  param: VaryingParam,
  range: { value?: number; min?: number; max?: number },
): Partial<BrushConfig> => {
  const current = readRange(config, param);
  const limits = PARAM_LIMITS[param];
  const kind = KINDS[param];
  if (!current.varies) {
    const value = clamp(range.value ?? current.value, limits.min, limits.max);
    return { [param]: fromUnit(param, value) };
  }
  let min = clamp(range.min ?? current.min, limits.min, limits.max);
  let max = clamp(range.max ?? current.max, limits.min, limits.max);
  if (min > max) [min, max] = [max, min];
  const { variation, changes } = withRange(config, param);
  if (kind === "scale") {
    changes[param as "width"] = fromUnit(param, Math.max(max, 1e-6));
    variation.min = max > 0 ? min / max : 0;
    variation.max = 1;
  } else {
    // Rotation and offsets: the low end as the value, and how far the high end is from it
    changes[param as "rotation"] = min;
    variation.min = 0;
    variation.max = max - min;
  }
  return { ...changes, [configKey(param)]: variation };
};

/**
 * Turn a source on or off for a setting, as config changes. Several can be on at once (their shares multiply). The
 * first source turned on gives the setting a starting range (half to full size, a full turn, or 10 pixels either
 * way), and a source turned on starts with its full range (0–1).
 *
 * @example
 * setSource({ width: 40 }, "width", "pressure", true);
 * // { widthConfig: { usePressure: true, minPressure: 0, maxPressure: 1, min: 0.5, max: 1 } }
 */
export const setSource = (
  config: BrushConfig,
  param: VaryingParam,
  source: VariationSource,
  on: boolean,
): Partial<BrushConfig> => {
  const { variation, changes } = withRange(config, param);
  const [useKey, minKey, maxKey] = SOURCE_KEYS[source];
  if (on && !variation[useKey]) {
    if (!anyOn(variation))
      [variation.min, variation.max] = STARTING_RANGES[KINDS[param]];
    variation[minKey] = 0;
    variation[maxKey] = 1;
  }
  variation[useKey] = on;
  return { ...changes, [configKey(param)]: variation };
};

/**
 * Write a source's range (0–1) for a setting, as config changes.
 *
 * @example
 * writeSourceRange({ widthConfig: { useTilt: true } }, "width", "tilt", { min: 0.2, max: 0.8 });
 * // { widthConfig: { useTilt: true, minTilt: 0.2, maxTilt: 0.8, min: 0, max: 1 } }
 */
export const writeSourceRange = (
  config: BrushConfig,
  param: VaryingParam,
  source: VariationSource,
  range: { min: number; max: number },
): Partial<BrushConfig> => {
  const { variation, changes } = withRange(config, param);
  const [, minKey, maxKey] = SOURCE_KEYS[source];
  variation[minKey] = clamp(Math.min(range.min, range.max), 0, 1);
  variation[maxKey] = clamp(Math.max(range.min, range.max), 0, 1);
  return { ...changes, [configKey(param)]: variation };
};

/**
 * Give a source its own profile graph for a setting, as config changes; none removes it.
 *
 * @example
 * writeSourceProfile(config, "width", "pressure", PROFILE_PRESETS[1].content.points, "overweight");
 */
export const writeSourceProfile = (
  config: BrushConfig,
  param: VaryingParam,
  source: VariationSource,
  profile: ProfilePoint[] | undefined,
  profileId?: string,
): Partial<BrushConfig> => {
  const { variation, changes } = withRange(config, param);
  const [, , , profileKey, idKey] = SOURCE_KEYS[source];
  // Without the source's graph and its ID, then with the new ones (if any)
  const kept = Object.fromEntries(
    Object.entries(variation).filter(
      ([key]) => key !== profileKey && key !== idKey,
    ),
  ) as BrushParamConfig;
  if (profile) {
    kept[profileKey] = profile;
    if (profileId !== undefined) kept[idKey] = profileId;
  }
  return { ...changes, [configKey(param)]: kept };
};

/** How a setting varies with a source, to compare: off, or on with the setting's range and the source's */
const sourceState = (
  config: BrushConfig,
  param: VaryingParam,
  source: VariationSource,
): string => {
  const { on, min, max, profile } = readRange(config, param).sources[source];
  if (!on) return "off";
  // A source is on, so there's a variation
  const variation = config[configKey(param)] as BrushParamConfig;
  return JSON.stringify([
    variation.min ?? null,
    variation.max ?? null,
    min,
    max,
    profile ?? null,
  ]);
};

/**
 * Whether any of the pen settings (`PEN_PARAMS`) varies with a source differently from a preset: turned on or off, or
 * with another range or profile graph.
 *
 * @example
 * differsFromPreset({ widthConfig: { usePressure: true } }, {}, "pressure"); // true
 */
export const differsFromPreset = (
  config: BrushConfig,
  preset: BrushConfig,
  source: PenSource,
): boolean =>
  PEN_PARAMS.some(
    (param) =>
      sourceState(config, param, source) !== sourceState(preset, param, source),
  );

/**
 * Put back how a preset varies the pen settings (`PEN_PARAMS`) that vary with a source differently from it, as config
 * changes: each such setting's whole variation (every source and its profile graph).
 *
 * @example
 * resetSource({ widthConfig: { usePressure: true } }, {}, "pressure"); // { widthConfig: {} }
 */
export const resetSource = (
  config: BrushConfig,
  preset: BrushConfig,
  source: PenSource,
): Partial<BrushConfig> =>
  Object.fromEntries(
    PEN_PARAMS.filter(
      (param) =>
        sourceState(config, param, source) !==
        sourceState(preset, param, source),
    ).map((param) => {
      const key = configKey(param);
      return [key, structuredClone(preset[key] ?? {})];
    }),
  );
