// JSON schemas for the user's app settings (input settings, keyboard shortcuts, colour palette, colours, profile graphs,
// theme and language), as kept in the browser and in exported settings files.
import type { InputSettingsData } from "../classes/InputSettings";
import {
  LOCALE_PATTERN,
  MAX_LOCALE_LENGTH,
  RENDERINGS,
  THEMES,
  type UiSettingsData,
} from "../classes/UiSettings/index.ts";
import type { KeyCombo } from "../utils/shortcuts";
import { HEX_COLOUR_PATTERN, paletteColoursSchema } from "../palette/schema.ts";
import type { ProfileGraph } from "../profiles/index.ts";
import { MAX_SAVED_PROFILES, profileGraphSchema } from "../profiles/schema.ts";

/** The `format` of a settings file, unless the implementer names their own (see `PaintCanvasNames`) */
export const SETTINGS_FILE_FORMAT = "paintcanvas-settings";

/** Formats of settings files that are imported by default */
export const SETTINGS_FILE_FORMATS: readonly string[] = [SETTINGS_FILE_FORMAT];

/** The version of the settings file format */
export const SETTINGS_FILE_VERSION = 1;

/** Longest settings file format name (characters) */
export const MAX_SETTINGS_FILE_FORMAT_LENGTH = 100;

/** Most keyboard shortcuts in saved settings */
export const MAX_SAVED_SHORTCUTS = 200;

/** The user's app settings. Each part is optional, so a file can hold only some of them. */
export interface AppSettings {
  /** How input devices control the canvas */
  input?: Partial<InputSettingsData>;
  /** Each configurable keyboard shortcut action's key combination, by ID (null when it has none) */
  shortcuts?: Record<string, KeyCombo | null>;
  /** The colour palette's colours, as `#rrggbb` */
  palette?: string[];
  /** The foreground and background colours, as `#rrggbb` */
  colours?: { foreground: string; background: string };
  /** The user's own profile graphs */
  profiles?: ProfileGraph[];
  /** The theme, language and where canvases draw */
  ui?: Partial<UiSettingsData>;
}

/** A settings file: what users export and import */
export interface SettingsFile {
  /** Names the app or kind of file, e.g. `SETTINGS_FILE_FORMAT` */
  format: string;
  version: typeof SETTINGS_FILE_VERSION;
  settings: AppSettings;
}

/** A `#rrggbb` colour */
const hexColour = { type: "string", pattern: HEX_COLOUR_PATTERN } as const;

/** Schema of a key combination */
export const keyComboSchema = {
  $id: "paintcanvas/key-combo",
  type: "object",
  additionalProperties: false,
  required: ["key"],
  properties: {
    key: { type: "string", minLength: 1, maxLength: 32 },
    cmd: { type: "boolean" },
    ctrl: { type: "boolean" },
    shift: { type: "boolean" },
    alt: { type: "boolean" },
  },
} as const;

/** Schema of the user's app settings */
export const settingsSchema = {
  $id: "paintcanvas/settings",
  type: "object",
  additionalProperties: false,
  properties: {
    input: {
      type: "object",
      additionalProperties: false,
      properties: {
        scrollPan: { type: "boolean" },
        pinchZoom: { type: "boolean" },
        modifierScrollZoom: { type: "boolean" },
        focusPen: { type: "boolean" },
        gestures: {
          type: "object",
          maxProperties: 20,
          additionalProperties: { type: "string", maxLength: 50 },
        },
      },
    },
    shortcuts: {
      type: "object",
      maxProperties: MAX_SAVED_SHORTCUTS,
      propertyNames: { maxLength: 64 },
      // Resolved against this schema's $id, so it is "paintcanvas/key-combo"
      additionalProperties: {
        anyOf: [{ type: "null" }, { $ref: "key-combo" }],
      },
    },
    palette: paletteColoursSchema,
    colours: {
      type: "object",
      additionalProperties: false,
      required: ["foreground", "background"],
      properties: { foreground: hexColour, background: hexColour },
    },
    profiles: {
      type: "array",
      maxItems: MAX_SAVED_PROFILES,
      items: { $ref: profileGraphSchema.$id },
    },
    ui: {
      type: "object",
      additionalProperties: false,
      properties: {
        theme: { enum: THEMES },
        locale: {
          type: "string",
          minLength: 1,
          maxLength: MAX_LOCALE_LENGTH,
          pattern: LOCALE_PATTERN,
        },
        rendering: { enum: RENDERINGS },
      },
    },
  },
} as const;

/** Schema of a settings file */
export const settingsFileSchema = {
  $id: "paintcanvas/settings-file",
  type: "object",
  additionalProperties: false,
  required: ["format", "version", "settings"],
  properties: {
    format: {
      type: "string",
      minLength: 1,
      maxLength: MAX_SETTINGS_FILE_FORMAT_LENGTH,
    },
    version: { const: SETTINGS_FILE_VERSION },
    // Resolved against this schema's $id, so it is "paintcanvas/settings"
    settings: { $ref: "settings" },
  },
} as const;
