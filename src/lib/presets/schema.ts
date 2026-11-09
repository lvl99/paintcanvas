// JSON schemas for brush presets saved by users, and for the files they are exported to and imported from.
import {
  MAX_PROFILE_TEXT_LENGTH,
  profilePointsSchema,
} from "../profiles/schema.ts";

/** Matches a lowercase UUID */
export const UUID_PATTERN =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

/** The `format` of a brush preset file, unless the implementer names their own (see `PaintCanvasNames`) */
export const BRUSH_PRESET_FILE_FORMAT = "paintcanvas-brush-presets";

/** Formats of brush preset files that are imported by default */
export const BRUSH_PRESET_FILE_FORMATS: readonly string[] = [
  BRUSH_PRESET_FILE_FORMAT,
];

/** Longest brush preset file format name (characters) */
export const MAX_PRESET_FILE_FORMAT_LENGTH = 100;

/** The version of the brush preset file format */
export const BRUSH_PRESET_FILE_VERSION = 1;

/** Most presets in one file */
export const MAX_PRESETS_PER_FILE = 1000;

/** Longest preset name, author name or handle (characters) */
export const MAX_PRESET_TEXT_LENGTH = 100;

/** Longest brush shape data URL (characters): a 2 MB PNG as base64 */
export const MAX_SHAPE_DATA_URL_LENGTH =
  Math.ceil((2 * 1024 * 1024) / 3) * 4 + 22;

/** Matches a PNG data URL */
export const PNG_DATA_URL_PATTERN =
  "^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$";

/** A brush preset file: what users export and import */
export interface BrushPresetFile {
  /** Names the app or kind of file, e.g. `BRUSH_PRESET_FILE_FORMAT` */
  format: string;
  version: typeof BRUSH_PRESET_FILE_VERSION;
  /** Presets, each matching `brushPresetSchema` */
  presets: Record<string, unknown>[];
}

/** A 0–1 factor */
const factor = { type: "number", minimum: 0, maximum: 1 } as const;

/** How a brush parameter varies per stamp (see `BrushParamConfig` in the app) */
const paramConfig = {
  type: "object",
  additionalProperties: false,
  properties: {
    useRandomise: { type: "boolean" },
    minRandomise: factor,
    maxRandomise: factor,
    usePressure: { type: "boolean" },
    minPressure: factor,
    maxPressure: factor,
    useTilt: { type: "boolean" },
    minTilt: factor,
    maxTilt: factor,
    profile: profilePointsSchema,
    profileId: {
      type: "string",
      minLength: 1,
      maxLength: MAX_PROFILE_TEXT_LENGTH,
    },
  },
} as const;

/** A colour value: a number, or a number as text */
const colourValue = {
  anyOf: [{ type: "number" }, { type: "string", maxLength: 20 }],
} as const;

/** Short text, such as a name */
const text = {
  type: "string",
  minLength: 1,
  maxLength: MAX_PRESET_TEXT_LENGTH,
} as const;

/** JSON schema for a brush preset a user made or imported (see `BrushConfig` in the app) */
export const brushPresetSchema = {
  $id: "paintcanvas/brush-preset",
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", pattern: UUID_PATTERN },
    name: text,
    group: text,
    version: { type: "string", maxLength: 20 },
    author: {
      anyOf: [
        text,
        {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            name: text,
            handle: text,
            email: { type: "string", maxLength: 254 },
            website: { type: "string", maxLength: 2048 },
          },
        },
      ],
    },
    image: {
      type: "string",
      pattern: PNG_DATA_URL_PATTERN,
      maxLength: MAX_SHAPE_DATA_URL_LENGTH,
    },
    colourMode: { enum: [0, 1] },
    hue: colourValue,
    hueConfig: paramConfig,
    saturation: colourValue,
    saturationConfig: paramConfig,
    lightness: colourValue,
    lightnessConfig: paramConfig,
    red: colourValue,
    redConfig: paramConfig,
    green: colourValue,
    greenConfig: paramConfig,
    blue: colourValue,
    blueConfig: paramConfig,
    alpha: factor,
    alphaConfig: paramConfig,
    width: { type: "number", minimum: 1, maximum: 256 },
    widthConfig: paramConfig,
    height: { type: "number", minimum: 1, maximum: 256 },
    heightConfig: paramConfig,
    constrainProportions: { type: "boolean" },
    rotation: { type: "number", minimum: -360, maximum: 360 },
    rotationConfig: paramConfig,
    offsetX: { type: "number", minimum: -256, maximum: 256 },
    offsetXConfig: paramConfig,
    offsetY: { type: "number", minimum: -256, maximum: 256 },
    offsetYConfig: paramConfig,
    sampleRate: { type: "number", minimum: 5, maximum: 400 },
    smoothingType: { enum: [0, 1, 2, 3] },
    spacing: { type: "number", minimum: 0, maximum: 200 },
    snapToPixelGrid: { type: "boolean" },
  },
} as const;

/** JSON schema for a brush preset file */
export const brushPresetFileSchema = {
  $id: "paintcanvas/brush-preset-file",
  type: "object",
  additionalProperties: false,
  required: ["format", "version", "presets"],
  properties: {
    format: {
      type: "string",
      minLength: 1,
      maxLength: MAX_PRESET_FILE_FORMAT_LENGTH,
    },
    version: { const: BRUSH_PRESET_FILE_VERSION },
    presets: {
      type: "array",
      maxItems: MAX_PRESETS_PER_FILE,
      // Resolved against this schema's $id, so it is "paintcanvas/brush-preset"
      items: { $ref: "brush-preset" },
    },
  },
} as const;
