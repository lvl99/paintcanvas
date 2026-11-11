import { formatErrors } from "../presets";
import {
  validateSettings,
  validateSettingsFile,
} from "../validation/validators.generated.js";
import type PaintCanvas from "../classes/PaintCanvas";
import type { InputSettingsData } from "../classes/InputSettings";
import {
  SETTINGS_FILE_FORMAT,
  SETTINGS_FILE_FORMATS,
  SETTINGS_FILE_VERSION,
  type AppSettings,
} from "./schema";

export * from "./schema";

/** Messages shown when importing settings fails */
export const SETTINGS_FILE_ERRORS = {
  incompatible: "Settings JSON file not compatible",
  read: "Failed to read settings JSON file",
} as const;

/** Importing settings failed, with a message for the user */
export class SettingsFileError extends Error {}

/** Result of checking settings */
export type SettingsValidationResult =
  { valid: true; value: AppSettings } | { valid: false; errors: string[] };

/**
 * Check app settings (e.g. kept in the browser) against `settingsSchema`.
 *
 * @example
 * isValidSettings({ palette: ["#ff0000"] }).valid; // true
 */
export const isValidSettings = (input: unknown): SettingsValidationResult =>
  validateSettings(input)
    ? { valid: true, value: input }
    : { valid: false, errors: formatErrors(validateSettings.errors) };

/** What `collectSettings` leaves out */
export interface CollectSettingsOptions {
  /** Leave out the profile graphs, e.g. when a profile store keeps them */
  withoutProfiles?: boolean;
}

/**
 * The app settings of a canvas: its input settings, keyboard shortcuts, colour palette, colours, profile graphs, theme
 * and language.
 *
 * @example
 * collectSettings(canvas).palette; // ["#2c6bff", ...]
 * collectSettings(canvas, { withoutProfiles: true }).profiles; // undefined
 */
export const collectSettings = (
  app: PaintCanvas,
  { withoutProfiles = false }: CollectSettingsOptions = {},
): AppSettings => ({
  input: structuredClone(app.input.data) as InputSettingsData,
  shortcuts: structuredClone(app.shortcuts.bindings),
  palette: [...app.palette.colours],
  colours: { ...app.colours },
  ...(withoutProfiles
    ? {}
    : { profiles: structuredClone([...app.profiles.graphs]) }),
  ui: { ...app.ui.data },
});

/**
 * Use app settings on a canvas, e.g. ones kept in the browser or imported. Parts left out stay as they are; invalid
 * values within a part are left out (see each part's sanitising). Profile graphs are added to the user's own, replacing
 * those with the same IDs.
 *
 * @example
 * applySettings(canvas, { colours: { foreground: "#ff0000", background: "#ffffff" } });
 */
export const applySettings = (
  app: PaintCanvas,
  settings: AppSettings,
): void => {
  if (settings.input) app.input.update(settings.input);
  if (settings.shortcuts) app.shortcuts.load(settings.shortcuts);
  if (settings.palette) app.palette.set(settings.palette);
  if (settings.colours) {
    app.setColour(settings.colours.foreground, "foreground");
    app.setColour(settings.colours.background, "background");
  }
  if (settings.profiles) app.profiles.merge(settings.profiles);
  if (settings.ui) app.ui.update(settings.ui);
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
 * Write app settings to a settings file (JSON) of a format (see `PaintCanvasNames.settingsFileFormat`).
 *
 * @example
 * exportSettingsFile(collectSettings(canvas)); // '{ "format": "paintcanvas-settings", "version": 1, "settings": {...} }'
 */
export const exportSettingsFile = (
  settings: AppSettings,
  format: string = SETTINGS_FILE_FORMAT,
): string =>
  JSON.stringify({ format, version: SETTINGS_FILE_VERSION, settings }, null, 2);

/**
 * Read the app settings in a settings file of one of the given formats (PaintCanvas's by default). Throws a
 * `SettingsFileError` if it isn't valid JSON or a compatible file.
 *
 * @example
 * applySettings(canvas, parseSettingsFile(text));
 */
export const parseSettingsFile = (
  text: string,
  formats: readonly string[] = SETTINGS_FILE_FORMATS,
): AppSettings => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SettingsFileError(SETTINGS_FILE_ERRORS.incompatible);
  }
  if (!validateSettingsFile(data) || !formats.includes(data.format))
    throw new SettingsFileError(SETTINGS_FILE_ERRORS.incompatible);
  return data.settings;
};
