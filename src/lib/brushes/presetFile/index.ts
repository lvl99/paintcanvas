import {
  BRUSH_PRESET_FILE_FORMAT,
  BRUSH_PRESET_FILE_FORMATS,
  BRUSH_PRESET_FILE_VERSION,
  isValidBrushPreset,
  isValidBrushPresetFile,
} from "../../presets";
import type { BrushConfig } from "../types";

/** Messages shown when importing or exporting presets fails */
export const PRESET_FILE_ERRORS = {
  incompatible: "Brush preset JSON file not compatible",
  read: "Failed to read brush preset JSON file",
  export: "Error exporting brush preset JSON file",
  empty: "No brush presets to export",
} as const;

/** Importing or exporting presets failed, with a message for the user */
export class PresetFileError extends Error {}

/**
 * The file name presets are exported to on a day, starting with a prefix (see `PaintCanvasNames.filePrefix`).
 *
 * @example
 * presetFileName(new Date(2026, 9, 24)); // "paintcanvas-brush-presets-2026-10-24.json"
 * presetFileName(new Date(2026, 9, 24), "myapp"); // "myapp-brush-presets-2026-10-24.json"
 */
export const presetFileName = (
  date: Date = new Date(),
  prefix = "paintcanvas",
): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-brush-presets-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
};

/**
 * Write presets to a brush preset file (JSON) of a format (see `PaintCanvasNames.presetFileFormat`). Throws a
 * `PresetFileError` if there are none, or one can't be exported (e.g. its shape isn't a PNG data URL).
 *
 * @example
 * exportPresetFile([myPreset]); // '{ "format": "paintcanvas-brush-presets", "version": 1, "presets": [...] }'
 */
export const exportPresetFile = (
  presets: BrushConfig[],
  format: string = BRUSH_PRESET_FILE_FORMAT,
): string => {
  if (presets.length === 0) throw new PresetFileError(PRESET_FILE_ERRORS.empty);
  if (!presets.every((preset) => isValidBrushPreset(preset).valid))
    throw new PresetFileError(PRESET_FILE_ERRORS.export);
  return JSON.stringify(
    {
      format,
      version: BRUSH_PRESET_FILE_VERSION,
      presets,
    },
    null,
    2,
  );
};

/**
 * Read the presets in a brush preset file of one of the given formats (PaintCanvas's by default).
 * Throws a `PresetFileError` if it isn't valid JSON or a compatible file.
 */
export const parsePresetFile = (
  text: string,
  formats: readonly string[] = BRUSH_PRESET_FILE_FORMATS,
): BrushConfig[] => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PresetFileError(PRESET_FILE_ERRORS.incompatible);
  }
  const result = isValidBrushPresetFile(data);
  if (!result.valid || !formats.includes(result.value.format))
    throw new PresetFileError(PRESET_FILE_ERRORS.incompatible);
  return result.value.presets as unknown as BrushConfig[];
};
