// JSON schemas for brush presets saved by users, and for the collection files they are exported to and imported from.
// Imported with extensions, as the validator build script runs this file in Node
import { profileIdSchema, profilePointsSchema } from "../profiles/schema.ts";
import {
  UUID_PATTERN,
  authorSchema,
  collectionSchema,
  fileSchemaUrlSchema,
} from "../assets/schema.ts";
import { SCHEMA_DIALECT, schemaUrl } from "../schemas/index.ts";

export { UUID_PATTERN };

/** Version of the brush preset schema */
export const BRUSH_PRESET_SCHEMA_VERSION = "1.0.0";

/** `@type` of a brush preset */
export const BRUSH_PRESET_TYPE = "PaintCanvas/BrushConfig";

/** Version of the brush preset collection schema */
export const BRUSH_PRESET_COLLECTION_SCHEMA_VERSION = "1.0.0";

/** `@type` of a brush preset collection file */
export const BRUSH_PRESET_COLLECTION_TYPE = "PaintCanvas/BrushConfigCollection";

/** Most presets in one file */
export const MAX_PRESETS_PER_FILE = 1000;

/** Longest preset name (characters) */
export const MAX_PRESET_TEXT_LENGTH = 100;

/** Longest brush shape data URL (characters): a 2 MB PNG as base64 */
export const MAX_SHAPE_DATA_URL_LENGTH =
  Math.ceil((2 * 1024 * 1024) / 3) * 4 + 22;

/** Matches a PNG data URL */
export const PNG_DATA_URL_PATTERN =
  "^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$";

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
    profileId: profileIdSchema,
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
  $schema: SCHEMA_DIALECT,
  $id: schemaUrl("brush-preset", BRUSH_PRESET_SCHEMA_VERSION),
  "@type": BRUSH_PRESET_TYPE,
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    // Named when the preset is a file of its own
    $schema: fileSchemaUrlSchema,
    "@type": { const: BRUSH_PRESET_TYPE },
    id: { type: "string", pattern: UUID_PATTERN },
    name: text,
    group: text,
    version: { type: "string", maxLength: 20 },
    author: authorSchema,
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

/** JSON schema for a brush preset collection file */
export const brushPresetCollectionSchema = collectionSchema({
  name: "brush-preset-collection",
  version: BRUSH_PRESET_COLLECTION_SCHEMA_VERSION,
  type: BRUSH_PRESET_COLLECTION_TYPE,
  item: brushPresetSchema.$id,
  maxItems: MAX_PRESETS_PER_FILE,
});
