// Types describing brush and eraser presets, and the brush strokes they are applied along.
import type { ProfilePoint } from "../../profiles";
import type { Asset } from "../../assets/schema";

export type { AssetAuthor, AssetAuthorDetails } from "../../assets/schema";

/** Which colour settings a brush varies */
export enum ColourMode {
  HSL,
  RGB,
}

/** How the line between a stroke's recorded points is drawn */
export enum SmoothingType {
  /** Same as Linear (kept for older presets) */
  None,
  /** Straight lines between points */
  Linear,
  /** Quadratic curves through the midpoints between points (smooth, no lag) */
  BezierQuad,
  /** Cubic curves whose handles follow the direction of movement before and after each point (smoothest; lags one point) */
  BezierCubic,
}

/**
 * Controls how a brush parameter varies for each stamp along a stroke. All ranges are fractions from 0 to 1.
 *
 * Each enabled source produces a factor:
 *
 * - Randomise: `minRandomise + (maxRandomise - minRandomise) * Math.random()`
 * - Pressure: `minPressure + (maxPressure - minPressure) * pressure` (pressure 0–1 from the pen)
 * - Tilt: `minTilt + (maxTilt - minTilt) * tilt` (tilt 0 = pen upright, 1 = pen flat)
 *
 * The factors are multiplied together and applied according to the kind of parameter:
 *
 * - Scale parameters (width, height, alpha, saturation, lightness, red, green, blue): `value * factor`
 * - Angle parameters (rotation, hue): `value + factor * 360` degrees. For rotation, tilt instead sets the
 *   angle from the direction the pen leans (like a calligraphy nib).
 * - Offset parameters (offsetX, offsetY): `value ± factor * brush size`, in a random direction (scatter)
 *
 * @example
 * // Width varies randomly between 50% and 100% and follows pen pressure from 20% to 100%
 * const widthConfig: BrushParamConfig = {
 *   useRandomise: true, minRandomise: 0.5, maxRandomise: 1,
 *   usePressure: true, minPressure: 0.2, maxPressure: 1,
 * };
 */
export interface BrushParamConfig {
  /**
   * Vary the parameter randomly for each stamp, between `minRandomise` and `maxRandomise`
   * @default false
   */
  useRandomise?: boolean;
  /**
   * Lowest random factor (0–1)
   * @default 1
   */
  minRandomise?: number;
  /**
   * Highest random factor (0–1)
   * @default 1
   */
  maxRandomise?: number;
  /**
   * Vary the parameter with pen pressure, when the device provides it
   * @default false
   */
  usePressure?: boolean;
  /**
   * Factor at the lightest pressure (0–1)
   * @default 0
   */
  minPressure?: number;
  /**
   * Factor at full pressure (0–1)
   * @default 1
   */
  maxPressure?: number;
  /**
   * Vary the parameter with pen tilt, when the device provides it
   * @default false
   */
  useTilt?: boolean;
  /**
   * Factor when the pen is upright (0–1)
   * @default 0
   */
  minTilt?: number;
  /**
   * Factor when the pen is flat (0–1)
   * @default 1
   */
  maxTilt?: number;
  /**
   * The profile graph the input (pressure, tilt or the random number) goes through before setting the factor between
   * its min and max, e.g. so a light touch goes most of the way (see `applyProfile`). A straight line by default.
   */
  profile?: ProfilePoint[];
  /** The ID of the profile graph `profile` came from (a preset's or one of the user's), to show its name */
  profileId?: string;
}

/** A brush's settings: what a brush preset holds (its content), and what the brush engine draws with */
export interface BrushConfig {
  /**
   * Brush shape: an image whose alpha values define the shape (its colours are ignored).
   * A data URL string, or raw image file bytes. Defaults to a hard round shape.
   */
  image?: string | Uint8Array;
  /**
   * Brush colour mode affects how colour settings are applied.
   * @default ColourMode.HSL
   */
  colourMode?: ColourMode;
  /**
   * Initial colour hue value (0–359)
   * @default 0
   */
  hue?: string | number;
  /** How hue varies per stamp (angle: adds up to 360°; see {@link BrushParamConfig}) */
  hueConfig?: BrushParamConfig;
  /**
   * Initial colour saturation value (0–100)
   * @default 100
   */
  saturation?: string | number;
  /** How saturation varies per stamp (scale; see {@link BrushParamConfig}) */
  saturationConfig?: BrushParamConfig;
  /**
   * Initial colour lightness value (0–100)
   * @default 50
   */
  lightness?: string | number;
  /** How lightness varies per stamp (scale; see {@link BrushParamConfig}) */
  lightnessConfig?: BrushParamConfig;
  /**
   * Initial colour red value (0–255)
   * @default 0
   */
  red?: string | number;
  /** How red varies per stamp (scale; see {@link BrushParamConfig}) */
  redConfig?: BrushParamConfig;
  /**
   * Initial colour green value (0–255)
   * @default 0
   */
  green?: string | number;
  /** How green varies per stamp (scale; see {@link BrushParamConfig}) */
  greenConfig?: BrushParamConfig;
  /**
   * Initial colour blue value (0–255)
   * @default 0
   */
  blue?: string | number;
  /** How blue varies per stamp (scale; see {@link BrushParamConfig}) */
  blueConfig?: BrushParamConfig;
  /**
   * Initial alpha value (0–1)
   * @default 1
   */
  alpha?: number;
  /** How alpha varies per stamp (scale; see {@link BrushParamConfig}) */
  alphaConfig?: BrushParamConfig;
  /**
   * Default width in pixels (the user can change it from 1 to 256)
   * @default 1
   */
  width?: number;
  /** How width varies per stamp (scale; see {@link BrushParamConfig}) */
  widthConfig?: BrushParamConfig;
  /**
   * Default height in pixels (the user can change it from 1 to 256)
   * @default 1
   */
  height?: number;
  /** How height varies per stamp (scale; see {@link BrushParamConfig}) */
  heightConfig?: BrushParamConfig;
  /** Keep the width-to-height ratio when the size changes */
  constrainProportions?: boolean;
  /**
   * Rotation in degrees
   * @default 0
   */
  rotation?: number;
  /** How rotation varies per stamp (angle: adds up to 360°; tilt sets the angle from the pen's lean direction; see {@link BrushParamConfig}) */
  rotationConfig?: BrushParamConfig;
  /**
   * Horizontal offset of each stamp from the pointer, in pixels
   * @default 0
   */
  offsetX?: number;
  /** How offsetX varies per stamp (offset: scatters up to the factor × brush width either way; see {@link BrushParamConfig}) */
  offsetXConfig?: BrushParamConfig;
  /**
   * Vertical offset of each stamp from the pointer, in pixels
   * @default 0
   */
  offsetY?: number;
  /** How offsetY varies per stamp (offset: scatters up to the factor × brush height either way; see {@link BrushParamConfig}) */
  offsetYConfig?: BrushParamConfig;
  /**
   * How often (in milliseconds, 5–400) a new point is recorded while the pointer moves. Higher values record fewer points.
   * No points are recorded while the pointer is still.
   * @default 10
   */
  sampleRate?: number;
  /**
   * How the line between recorded points is drawn
   * @default SmoothingType.Linear
   */
  smoothingType?: SmoothingType;
  /**
   * Distance in pixels (0–200) between stamps of the brush shape along the line. 0 stamps at every pixel.
   * @default 5
   */
  spacing?: number;
  /**
   * Draw each stamp on whole pixels: its size is rounded to whole pixels and its top-left corner is rounded down
   * (`Math.floor`), so it never covers part of a pixel. Rotation other than a multiple of 90° still leaves the grid.
   * @default false
   */
  snapToPixelGrid?: boolean;
}

/** A named brush (or eraser) preset: a header that describes it, and its brush settings (`content`) */
export type BrushPreset = Asset<BrushConfig>;

/** Brush presets by ID */
export type BrushesConfig = Record<string, BrushPreset>;

export interface BrushStrokePoint {
  /** The X coordinate of the brush stroke point */
  x: number;
  /** The Y coordinate of the brush stroke point */
  y: number;
  /** The rotation (in radians) of the brush stroke point */
  rotation?: number;
  /** The pressure (0–1) of the brush stroke point, from `PointerEvent.pressure` */
  pressure?: number;
  /** The pen tilt (-90–90 degrees) along the X axis, from `PointerEvent.tiltX` */
  tiltX?: number;
  /** The pen tilt (-90–90 degrees) along the Y axis, from `PointerEvent.tiltY` */
  tiltY?: number;
}

export type BrushStroke = BrushStrokePoint[];
