import {
  BRUSH_PRESET_TYPE,
  UNTITLED_PRESET_NAME,
  formatErrors,
} from "../presets";
import { COLOUR_PALETTE_TYPE, UNTITLED_PALETTE_NAME } from "../palette/schema";
import { PROFILE_GRAPH_TYPE, UNTITLED_PROFILE_NAME } from "../profiles/schema";
import { sanitiseBrushPresets } from "../classes/CustomPresets";
import {
  validateAppSettings,
  validateSettings,
} from "../validation/validators.generated.js";
import {
  AssetFileError,
  UNKNOWN_AUTHOR,
  upgradeAsset,
  type AssetAuthor,
} from "../assets";
import { compareVersions, majorVersion, parseSchemaUrl } from "../schemas";
import type PaintCanvas from "../classes/PaintCanvas";
import type { InputSettingsData } from "../classes/InputSettings";
import { sanitisePalette } from "../classes/Palette";
import {
  APP_SETTINGS_SCHEMA_VERSION,
  APP_SETTINGS_TYPE,
  appSettingsSchema,
  type AppSettings,
  type AppSettingsFile,
} from "./schema";

export * from "./schema";

/** Result of checking settings */
export type SettingsValidationResult =
  { valid: true; value: AppSettings } | { valid: false; errors: string[] };

/** Whether a value is a plain object */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The assets app settings hold: their key, `@type`, and the name given to older ones without one */
const SETTINGS_ASSETS = [
  ["palettes", COLOUR_PALETTE_TYPE, UNTITLED_PALETTE_NAME],
  ["profiles", PROFILE_GRAPH_TYPE, UNTITLED_PROFILE_NAME],
  ["brushes", BRUSH_PRESET_TYPE, UNTITLED_PRESET_NAME],
] as const;

/**
 * Whether app settings hold assets of version 1 (see `upgradeSettings`).
 *
 * @example
 * hasOlderAssets({ palettes: [{ id: "…", name: "Sunset", colours: [] }] }); // true
 */
export const hasOlderAssets = (input: unknown): boolean =>
  isRecord(input) &&
  SETTINGS_ASSETS.some(
    ([key]) =>
      Array.isArray(input[key]) &&
      input[key].some((item) => isRecord(item) && !("content" in item)),
  );

/**
 * App settings with their colour palettes, profile graphs and brush presets of version 1 upgraded to version 2 (see
 * `upgradeAsset`). Anything else is left as it is.
 *
 * @param author - the author of older assets with none
 * @example
 * upgradeSettings({ palettes: [{ id: "…", name: "Sunset", colours: [] }] }, app.author);
 * // { palettes: [{ "@type": "PaintCanvas/ColourPalette", id: "…", name: "Sunset", author, content: { colours: [] } }] }
 */
export const upgradeSettings = (
  input: unknown,
  author: AssetAuthor = UNKNOWN_AUTHOR,
): unknown => {
  if (!isRecord(input)) return input;
  const upgraded = { ...input };
  for (const [key, type, name] of SETTINGS_ASSETS) {
    const items = input[key];
    if (Array.isArray(items))
      upgraded[key] = items.map((item) =>
        upgradeAsset(item, type, { name, author }),
      );
  }
  return upgraded;
};

/**
 * Check app settings (e.g. kept in the browser) against `settingsSchema`, upgrading assets of version 1 first (see
 * `upgradeSettings`).
 *
 * @param author - the author of older assets with none
 * @example
 * isValidSettings({ palette: ["#ff0000"] }).valid; // true
 */
export const isValidSettings = (
  input: unknown,
  author?: AssetAuthor,
): SettingsValidationResult => {
  const settings = upgradeSettings(input, author);
  return validateSettings(settings)
    ? { valid: true, value: settings }
    : { valid: false, errors: formatErrors(validateSettings.errors) };
};

/** Assets that app settings can hold */
export type SettingsAsset = "brushes" | "palettes" | "profiles";

/** What `collectSettings` leaves out */
export interface CollectSettingsOptions {
  /** Assets to leave out, e.g. ones kept in stores of their own */
  without?: readonly SettingsAsset[];
}

/**
 * The app settings of a canvas: its input settings, keyboard shortcuts, colours, the user's colour palettes, profile
 * graphs and brush presets, theme and language, and settings wrapper apps added (see `SettingsExtension`).
 *
 * @example
 * collectSettings(canvas).palettes; // the user's own palettes
 * collectSettings(canvas, { without: ["profiles"] }).profiles; // undefined
 */
export const collectSettings = (
  app: PaintCanvas,
  { without = [] }: CollectSettingsOptions = {},
): AppSettings => ({
  input: structuredClone(app.input.data) as InputSettingsData,
  shortcuts: structuredClone(app.shortcuts.bindings),
  ...(without.includes("palettes")
    ? {}
    : { palettes: structuredClone([...app.palettes.items]) }),
  colours: { ...app.colours },
  ...(without.includes("profiles")
    ? {}
    : { profiles: structuredClone([...app.profiles.graphs]) }),
  ...(without.includes("brushes")
    ? {}
    : { brushes: structuredClone(app.customPresets.presets) }),
  ui: { ...app.ui.data },
  ...structuredClone(app.settingsExtensions.collect()),
});

/** Name of the palette that colours saved in PaintCanvas's palette by older versions are moved to */
export const OLDER_PALETTE_NAME = "My colours";

/**
 * Keep colours that older versions saved in PaintCanvas's palette (which can no longer be changed) in a palette of the
 * user's own, named `OLDER_PALETTE_NAME`: unless they're PaintCanvas's colours, or one of the user's palettes already has
 * them.
 *
 * @example
 * keepOlderPalette(canvas, ["#123456"]); // the user now has a "My colours" palette with #123456
 */
export const keepOlderPalette = (
  app: PaintCanvas,
  colours: readonly string[],
): void => {
  const valid = sanitisePalette(colours) ?? [];
  const same = (other: readonly string[]) =>
    other.length === valid.length &&
    other.every((colour, i) => colour === valid[i]);
  if (
    valid.length === 0 ||
    same(app.palette.colours) ||
    app.palettes.items.some((palette) => same(palette.content.colours))
  )
    return;
  app.palettes.create(OLDER_PALETTE_NAME, valid, app.author);
};

/**
 * Use app settings on a canvas, e.g. ones kept in the browser or imported. Parts left out stay as they are; invalid
 * values within a part are left out (see each part's sanitising). Colour palettes, profile graphs and brush presets are
 * added to the user's own, replacing those with the same IDs. Colours older versions saved in PaintCanvas's palette are
 * moved to one of the user's own (see `keepOlderPalette`). Other parts go to the settings extensions (see
 * `SettingsExtensions.apply`).
 *
 * @example
 * await applySettings(canvas, { colours: { foreground: "#ff0000", background: "#ffffff" } });
 */
export const applySettings = async (
  app: PaintCanvas,
  settings: AppSettings,
): Promise<void> => {
  if (settings.input) app.input.update(settings.input);
  if (settings.shortcuts) app.shortcuts.load(settings.shortcuts);
  if (settings.palette) keepOlderPalette(app, settings.palette);
  if (settings.palettes) app.palettes.merge(settings.palettes, app.author);
  if (settings.colours) {
    app.setColour(settings.colours.foreground, "foreground");
    app.setColour(settings.colours.background, "background");
  }
  if (settings.profiles) app.profiles.merge(settings.profiles, app.author);
  if (settings.ui) app.ui.update(settings.ui);
  app.settingsExtensions.apply(settings);
  if (Array.isArray(settings.brushes))
    await app.customPresets.save(
      ...sanitiseBrushPresets(settings.brushes, app.author),
    );
};

/**
 * The file name settings are exported to on a day, starting with a prefix (see `PaintCanvasNames.filePrefix`).
 *
 * @example
 * settingsFileName(new Date(2026, 10, 4)); // "paintcanvas-settings-2026-11-04.json"
 */
export const settingsFileName = (
  date: Date = new Date(),
  prefix = "paintcanvas",
): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-settings-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
};

/**
 * Write app settings to an app settings file (JSON). Colours older versions saved in PaintCanvas's palette are left out.
 *
 * @example
 * exportSettingsFile(collectSettings(canvas)); // '{ "$schema": ".../app-settings-2.0.0.json", "@type": "PaintCanvas/AppSettings", ... }'
 */
export const exportSettingsFile = (settings: AppSettings): string => {
  const parts: AppSettings = { ...settings };
  delete parts.palette;
  const file: AppSettingsFile = {
    $schema: appSettingsSchema.$id,
    "@type": APP_SETTINGS_TYPE,
    ...parts,
  };
  return JSON.stringify(file, null, 2);
};

/**
 * Read the app settings in an app settings file. Settings files from before versioned schemas (`format`, `version: 1`
 * and `settings`, of any format name) and of version 1 are read too, with their assets upgraded (see
 * `upgradeSettings`). Throws an `AssetFileError`: `read` if it isn't JSON, `invalid` if it isn't a settings file or
 * doesn't match its schema, `unsupported` if it's a version the app can't read.
 *
 * @param author - the author of older assets with none
 * @example
 * await applySettings(canvas, parseSettingsFile(text, canvas.author));
 */
export const parseSettingsFile = (
  text: string,
  author?: AssetAuthor,
): AppSettings => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AssetFileError("read");
  }
  if (!isRecord(data)) throw new AssetFileError("invalid");
  // Older files keep their settings in `settings`; those are checked as kept in the browser
  if (typeof data.format === "string" && data.version === 1) {
    const result = isValidSettings(data.settings, author);
    if (!result.valid) throw new AssetFileError("invalid");
    return result.value;
  }
  const named = parseSchemaUrl(data.$schema);
  if (named?.name !== "app-settings") throw new AssetFileError("invalid");
  // Version 1 only differs in its assets, which are upgraded
  if (majorVersion(named.version) === 1)
    data = {
      ...(upgradeSettings(data, author) as Record<string, unknown>),
      $schema: appSettingsSchema.$id,
    };
  else if (
    majorVersion(named.version) !== majorVersion(APP_SETTINGS_SCHEMA_VERSION) ||
    compareVersions(named.version, APP_SETTINGS_SCHEMA_VERSION) > 0
  )
    throw new AssetFileError("unsupported");
  if (!validateAppSettings(data)) throw new AssetFileError("invalid");
  const settings: Record<string, unknown> = { ...data };
  delete settings.$schema;
  delete settings["@type"];
  return settings as AppSettings;
};
