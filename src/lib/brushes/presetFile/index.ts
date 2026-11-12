import AssetFile, { assetsToVersion2 } from "../../assets";
import {
  BRUSH_PRESET_COLLECTION_SCHEMA_VERSION,
  BRUSH_PRESET_COLLECTION_TYPE,
  BRUSH_PRESET_TYPE,
  UNTITLED_PRESET_NAME,
} from "../../presets";
import { validateBrushPresetCollection } from "../../validation/validators.generated.js";
import type { BrushPreset } from "../types";

/**
 * A preset from a brush preset file from before versioned schemas, with its author's `website` renamed `homepage`.
 */
const migrateLegacyPreset = (preset: Record<string, unknown>): unknown => {
  const author = preset?.author;
  if (typeof author !== "object" || author === null || !("website" in author))
    return preset;
  const { website, ...rest } = author as Record<string, unknown>;
  return { ...preset, author: { ...rest, homepage: website } };
};

/**
 * Reads and writes brush preset collection files. Files from before versioned schemas (`format`, `version: 1` and
 * `presets`) and of version 1 are migrated.
 *
 * @example
 * const presets = brushPresetFile.parse(await file.text()); // throws AssetFileError
 * const json = brushPresetFile.write(app.customPresets.presets);
 */
export const brushPresetFile = new AssetFile<BrushPreset>({
  schema: "brush-preset-collection",
  version: BRUSH_PRESET_COLLECTION_SCHEMA_VERSION,
  type: BRUSH_PRESET_COLLECTION_TYPE,
  validate: validateBrushPresetCollection,
  fileName: "brush-presets",
  legacyVersion: (data) =>
    typeof data.format === "string" && data.version === 1
      ? "legacy-1"
      : undefined,
  migrations: [
    {
      from: "legacy-1",
      to: "1.0.0",
      migrate: (data) => ({
        items: Array.isArray(data.presets)
          ? data.presets.map(migrateLegacyPreset)
          : data.presets,
      }),
    },
    assetsToVersion2(BRUSH_PRESET_TYPE, UNTITLED_PRESET_NAME),
  ],
});
