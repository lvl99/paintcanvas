// JSON schemas for colour palettes and the collection files users export and import them in.
// Imported with extensions, as the validator build script runs this file in Node
import {
  UUID_PATTERN,
  assetSchema,
  collectionSchema,
  type Asset,
} from "../assets/schema.ts";

/** Version of the colour palette schema */
export const COLOUR_PALETTE_SCHEMA_VERSION = "2.0.0";

/** `@type` of a colour palette */
export const COLOUR_PALETTE_TYPE = "PaintCanvas/ColourPalette";

/** Version of the colour palette collection schema */
export const COLOUR_PALETTE_COLLECTION_SCHEMA_VERSION = "2.0.0";

/** `@type` of a colour palette collection file */
export const COLOUR_PALETTE_COLLECTION_TYPE =
  "PaintCanvas/ColourPaletteCollection";

/** Most colours in a palette */
export const MAX_PALETTE_COLOURS = 1000;

/** Most palettes in one file */
export const MAX_PALETTES_PER_FILE = 100;

/** Name given to a colour palette of an older version that has none */
export const UNTITLED_PALETTE_NAME = "Untitled palette";

/** Matches a `#rrggbb` colour in any case */
export const HEX_COLOUR_PATTERN = "^#[0-9a-fA-F]{6}$";

/** A colour palette's content */
export interface ColourPaletteConfig {
  /** Colours as `#rrggbb`, in order */
  colours: string[];
}

/** A named list of colours */
export type ColourPalette = Asset<ColourPaletteConfig>;

/** Schema of a palette's colours */
export const paletteColoursSchema = {
  type: "array",
  maxItems: MAX_PALETTE_COLOURS,
  items: { type: "string", pattern: HEX_COLOUR_PATTERN },
} as const;

/** Schema of a colour palette's content */
export const colourPaletteConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["colours"],
  properties: { colours: paletteColoursSchema },
} as const;

/** Schema of a colour palette */
export const colourPaletteSchema = assetSchema({
  name: "colour-palette",
  version: COLOUR_PALETTE_SCHEMA_VERSION,
  type: COLOUR_PALETTE_TYPE,
  id: { type: "string", pattern: UUID_PATTERN },
  content: colourPaletteConfigSchema,
});

/** Schema of a colour palette collection file */
export const colourPaletteCollectionSchema = collectionSchema({
  name: "colour-palette-collection",
  version: COLOUR_PALETTE_COLLECTION_SCHEMA_VERSION,
  type: COLOUR_PALETTE_COLLECTION_TYPE,
  item: colourPaletteSchema.$id,
  maxItems: MAX_PALETTES_PER_FILE,
});
