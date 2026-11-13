// JSON schemas for the user's app settings (UI, input settings, keyboard shortcuts, colours, and their colour palettes,
// profile graphs and brush presets): as kept in the browser (`settingsSchema`) and in exported settings files
// (`appSettingsSchema`, published). Wrapper apps can add settings of their own (see `SettingsExtension`).
// Imported with extensions, as the validator build script runs this file in Node
import type { InputSettingsData } from "../classes/InputSettings";
import {
  LOCALE_PATTERN,
  MAX_LOCALE_LENGTH,
  RENDERINGS,
  THEMES,
  type UiSettingsData,
} from "../classes/UiSettings/index.ts";
import type { KeyCombo } from "../utils/shortcuts";
import {
  HEX_COLOUR_PATTERN,
  MAX_PALETTES_PER_FILE,
  colourPaletteSchema,
  paletteColoursSchema,
  type ColourPalette,
} from "../palette/schema.ts";
import type { ProfileGraph } from "../profiles/index.ts";
import { MAX_SAVED_PROFILES, profileGraphSchema } from "../profiles/schema.ts";
import { MAX_PRESETS_PER_FILE, brushPresetSchema } from "../presets/schema.ts";
import type { BrushPreset } from "../brushes/types/index.ts";
import { dateTimeSchema, fileSchemaUrlSchema } from "../assets/schema.ts";
import { SCHEMA_DIALECT, schemaUrl } from "../schemas/index.ts";

/** Version of the app settings schema */
export const APP_SETTINGS_SCHEMA_VERSION = "2.1.0";

/** `@type` of an app settings file */
export const APP_SETTINGS_TYPE = "PaintCanvas/AppSettings";

/** Most keyboard shortcuts in saved settings */
export const MAX_SAVED_SHORTCUTS = 200;

/**
 * The user's app settings. Each part is optional, so a file can hold only some of them. Wrapper apps add their own
 * parts under keys of their own (see `SettingsExtension`).
 */
export interface AppSettings {
  /** How input devices control the canvas */
  input?: Partial<InputSettingsData>;
  /** Each configurable keyboard shortcut action's key combination, by ID (null when it has none) */
  shortcuts?: Record<string, KeyCombo | null>;
  /**
   * Colours saved in PaintCanvas's palette by older versions, as `#rrggbb` (no longer saved: applying them moves them
   * to one of the user's palettes, see `keepOlderPalette`)
   */
  palette?: string[];
  /** The user's own colour palettes */
  palettes?: ColourPalette[];
  /** The foreground and background colours, as `#rrggbb` */
  colours?: { foreground: string; background: string };
  /** The user's own profile graphs */
  profiles?: ProfileGraph[];
  /** The user's own and imported brush presets */
  brushes?: BrushPreset[];
  /** The theme, language and where canvases draw */
  ui?: Partial<UiSettingsData>;
  /**
   * When the user last changed their settings (ISO 8601 date and time; see `SettingsAutosave`). Loading them doesn't
   * change it. Settings from before schema 2.1.0 have none.
   */
  updatedAt?: string;
  /** Parts added by wrapper apps, by their keys */
  [extension: string]: unknown;
}

/** An app settings file: what users export and import */
export type AppSettingsFile = Omit<AppSettings, "palette"> & {
  /** URL of the schema, which names its version */
  $schema: string;
  "@type": typeof APP_SETTINGS_TYPE;
};

/** A `#rrggbb` colour */
const hexColour = { type: "string", pattern: HEX_COLOUR_PATTERN } as const;

/** Schema of a key combination */
export const keyComboSchema = {
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

/** Schemas of each part of the app settings PaintCanvas has */
const settingsProperties = {
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
    additionalProperties: {
      anyOf: [{ type: "null" }, keyComboSchema],
    },
  },
  palettes: {
    type: "array",
    maxItems: MAX_PALETTES_PER_FILE,
    items: { $ref: colourPaletteSchema.$id },
  },
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
  brushes: {
    type: "array",
    maxItems: MAX_PRESETS_PER_FILE,
    items: { $ref: brushPresetSchema.$id },
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
  updatedAt: dateTimeSchema,
} as const;

/**
 * Schema of the user's app settings as kept in the browser: parts PaintCanvas doesn't know are left for wrapper apps
 * to check (see `SettingsExtension`), and colours older versions saved in PaintCanvas's palette (`palette`) are allowed.
 */
export const settingsSchema = {
  $id: "paintcanvas/settings",
  type: "object",
  properties: { ...settingsProperties, palette: paletteColoursSchema },
} as const;

/**
 * Schema of an app settings file. Parts it doesn't name are added by wrapper apps, which check them (see
 * `SettingsExtension`), and can publish schemas of their own that extend this one.
 */
export const appSettingsSchema = {
  $schema: SCHEMA_DIALECT,
  $id: schemaUrl("app-settings", APP_SETTINGS_SCHEMA_VERSION),
  "@type": APP_SETTINGS_TYPE,
  type: "object",
  required: ["$schema", "@type"],
  properties: {
    $schema: fileSchemaUrlSchema,
    "@type": { const: APP_SETTINGS_TYPE },
    ...settingsProperties,
  },
} as const;
