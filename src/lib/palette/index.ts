import AssetFile, { assetsToVersion2 } from "../assets";
import { validateColourPaletteCollection } from "../validation/validators.generated.js";
import {
  COLOUR_PALETTE_COLLECTION_SCHEMA_VERSION,
  COLOUR_PALETTE_COLLECTION_TYPE,
  COLOUR_PALETTE_TYPE,
  UNTITLED_PALETTE_NAME,
  type ColourPalette,
} from "./schema";

export * from "./schema";

/** The colours a palette starts with */
export const DEFAULT_PALETTE: readonly string[] = [
  "#2c6bff",
  "#8f3de8",
  "#f40f95",
  "#fb234a",
  "#fe7e07",
  "#ffd52c",
  "#6dc905",
  "#21e887",
  "#13c3f4",
  "#000000",
  "#333333",
  "#666666",
  "#999999",
  "#cccccc",
  "#ffffff",
];

/** Name given to the palette in a colour palette file from before versioned schemas */
export const LEGACY_PALETTE_NAME = "Imported palette";

/**
 * Reads and writes colour palette collection files. Files from before versioned schemas (`format` and `version: 1`,
 * holding one list of colours) are read as one palette named `LEGACY_PALETTE_NAME`, and files of version 1 are
 * migrated.
 *
 * @example
 * const palettes = colourPaletteFile.parse(await file.text());
 */
export const colourPaletteFile = new AssetFile<ColourPalette>({
  schema: "colour-palette-collection",
  version: COLOUR_PALETTE_COLLECTION_SCHEMA_VERSION,
  type: COLOUR_PALETTE_COLLECTION_TYPE,
  validate: validateColourPaletteCollection,
  fileName: "colour-palettes",
  legacyVersion: (data) =>
    typeof data.format === "string" && data.version === 1
      ? "legacy-1"
      : undefined,
  migrations: [
    {
      from: "legacy-1",
      to: "1.0.0",
      migrate: (data) => ({
        items: [
          {
            id: crypto.randomUUID(),
            name: LEGACY_PALETTE_NAME,
            colours: data.colours,
          },
        ],
      }),
    },
    assetsToVersion2(COLOUR_PALETTE_TYPE, UNTITLED_PALETTE_NAME),
  ],
});
