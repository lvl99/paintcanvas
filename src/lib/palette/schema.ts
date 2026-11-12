// JSON schemas for colour palettes and the collection files users export and import them in.
// Imported with extensions, as the validator build script runs this file in Node
import {
  UUID_PATTERN,
  authorSchema,
  collectionSchema,
  fileSchemaUrlSchema,
  type AssetAuthor,
} from "../assets/schema.ts";
import { SCHEMA_DIALECT, schemaUrl } from "../schemas/index.ts";

/** Version of the colour palette schema */
export const COLOUR_PALETTE_SCHEMA_VERSION = "1.0.0";

/** `@type` of a colour palette */
export const COLOUR_PALETTE_TYPE = "PaintCanvas/ColourPalette";

/** Version of the colour palette collection schema */
export const COLOUR_PALETTE_COLLECTION_SCHEMA_VERSION = "1.0.0";

/** `@type` of a colour palette collection file */
export const COLOUR_PALETTE_COLLECTION_TYPE =
  "PaintCanvas/ColourPaletteCollection";

/** Most colours in a palette */
export const MAX_PALETTE_COLOURS = 1000;

/** Most palettes in one file */
export const MAX_PALETTES_PER_FILE = 100;

/** Longest palette name (characters) */
export const MAX_PALETTE_NAME_LENGTH = 100;

/** Matches a `#rrggbb` colour in any case */
export const HEX_COLOUR_PATTERN = "^#[0-9a-fA-F]{6}$";

/** A named list of colours */
export interface ColourPalette {
  /** A UUID for the user's own palettes; a readable ID for built-in ones */
  id: string;
  name: string;
  author?: AssetAuthor;
  /** Colours as `#rrggbb`, in order */
  colours: string[];
}

/** Schema of a palette's colours */
export const paletteColoursSchema = {
  type: "array",
  maxItems: MAX_PALETTE_COLOURS,
  items: { type: "string", pattern: HEX_COLOUR_PATTERN },
} as const;

/** Schema of a colour palette */
export const colourPaletteSchema = {
  $schema: SCHEMA_DIALECT,
  $id: schemaUrl("colour-palette", COLOUR_PALETTE_SCHEMA_VERSION),
  "@type": COLOUR_PALETTE_TYPE,
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "colours"],
  properties: {
    // Named when the palette is a file of its own
    $schema: fileSchemaUrlSchema,
    "@type": { const: COLOUR_PALETTE_TYPE },
    id: { type: "string", pattern: UUID_PATTERN },
    name: {
      type: "string",
      minLength: 1,
      maxLength: MAX_PALETTE_NAME_LENGTH,
      pattern: "\\S",
    },
    author: authorSchema,
    colours: paletteColoursSchema,
  },
} as const;

/** Schema of a colour palette collection file */
export const colourPaletteCollectionSchema = collectionSchema({
  name: "colour-palette-collection",
  version: COLOUR_PALETTE_COLLECTION_SCHEMA_VERSION,
  type: COLOUR_PALETTE_COLLECTION_TYPE,
  item: colourPaletteSchema.$id,
  maxItems: MAX_PALETTES_PER_FILE,
});
