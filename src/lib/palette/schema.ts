// JSON schema for colour palette files, which users export and import.

/** The `format` of a colour palette file, unless the implementer names their own (see `PaintCanvasNames`) */
export const PALETTE_FILE_FORMAT = "paintcanvas-palette";

/** Formats of colour palette files that are imported by default */
export const PALETTE_FILE_FORMATS: readonly string[] = [PALETTE_FILE_FORMAT];

/** The version of the colour palette file format */
export const PALETTE_FILE_VERSION = 1;

/** Most colours in a palette (and in one file) */
export const MAX_PALETTE_COLOURS = 1000;

/** Longest palette file format name (characters) */
export const MAX_PALETTE_FILE_FORMAT_LENGTH = 100;

/** Matches a `#rrggbb` colour in any case */
export const HEX_COLOUR_PATTERN = "^#[0-9a-fA-F]{6}$";

/** A colour palette file: what users export and import */
export interface PaletteFile {
  /** Names the app or kind of file, e.g. `PALETTE_FILE_FORMAT` */
  format: string;
  version: typeof PALETTE_FILE_VERSION;
  /** Colours as `#rrggbb`, in palette order */
  colours: string[];
}

/** Schema of a colour palette file */
export const paletteFileSchema = {
  $id: "paintcanvas/palette-file",
  type: "object",
  additionalProperties: false,
  required: ["format", "version", "colours"],
  properties: {
    format: {
      type: "string",
      minLength: 1,
      maxLength: MAX_PALETTE_FILE_FORMAT_LENGTH,
    },
    version: { const: PALETTE_FILE_VERSION },
    colours: {
      type: "array",
      maxItems: MAX_PALETTE_COLOURS,
      items: { type: "string", pattern: HEX_COLOUR_PATTERN },
    },
  },
} as const;
