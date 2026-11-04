import { formatErrors } from "../presets";
import { validatePaletteFile } from "../validation/validators.generated.js";
import {
  PALETTE_FILE_FORMAT,
  PALETTE_FILE_FORMATS,
  PALETTE_FILE_VERSION,
  type PaletteFile,
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

/** Messages shown when importing or exporting a palette fails */
export const PALETTE_FILE_ERRORS = {
  incompatible: "Colour palette JSON file not compatible",
  read: "Failed to read colour palette JSON file",
} as const;

/** Importing a palette failed, with a message for the user */
export class PaletteFileError extends Error {}

/** Result of checking a palette file */
export type PaletteValidationResult =
  { valid: true; value: PaletteFile } | { valid: false; errors: string[] };

/**
 * Check a colour palette file against `paletteFileSchema`.
 *
 * @example
 * isValidPaletteFile({ format: "paintcanvas-palette", version: 1, colours: ["#ff0000"] }).valid; // true
 */
export const isValidPaletteFile = (input: unknown): PaletteValidationResult =>
  validatePaletteFile(input)
    ? { valid: true, value: input }
    : { valid: false, errors: formatErrors(validatePaletteFile.errors) };

/**
 * The file name a palette is exported to on a day, starting with a prefix (see `PaintCanvasNames.filePrefix`).
 *
 * @example
 * paletteFileName(new Date(2026, 10, 4)); // "paintcanvas-palette-2026-11-04.json"
 */
export const paletteFileName = (
  date: Date = new Date(),
  prefix = "paintcanvas",
): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-palette-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
};

/**
 * Write colours to a colour palette file (JSON) of a format (see `PaintCanvasNames.paletteFileFormat`).
 *
 * @example
 * exportPaletteFile(["#ff0000"]); // '{ "format": "paintcanvas-palette", "version": 1, "colours": ["#ff0000"] }'
 */
export const exportPaletteFile = (
  colours: readonly string[],
  format: string = PALETTE_FILE_FORMAT,
): string =>
  JSON.stringify({ format, version: PALETTE_FILE_VERSION, colours }, null, 2);

/**
 * Read the colours (as lowercase `#rrggbb`) in a colour palette file of one of the given formats (PaintCanvas's by
 * default). Throws a `PaletteFileError` if it isn't valid JSON or a compatible file.
 *
 * @example
 * parsePaletteFile('{ "format": "paintcanvas-palette", "version": 1, "colours": ["#FF0000"] }'); // ["#ff0000"]
 */
export const parsePaletteFile = (
  text: string,
  formats: readonly string[] = PALETTE_FILE_FORMATS,
): string[] => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PaletteFileError(PALETTE_FILE_ERRORS.incompatible);
  }
  const result = isValidPaletteFile(data);
  if (!result.valid || !formats.includes(result.value.format))
    throw new PaletteFileError(PALETTE_FILE_ERRORS.incompatible);
  return result.value.colours.map((colour) => colour.toLowerCase());
};
