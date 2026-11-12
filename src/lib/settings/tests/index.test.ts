import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { withoutType } from "../../validation/standalone";
import { profileGraphSchema } from "../../profiles/schema";
import { colourPaletteSchema } from "../../palette/schema";
import { brushPresetSchema } from "../../presets/schema";
import { AssetFileError } from "../../assets";
import {
  APP_SETTINGS_TYPE,
  OLDER_PALETTE_NAME,
  appSettingsSchema,
  applySettings,
  keepOlderPalette,
  collectSettings,
  exportSettingsFile,
  isValidSettings,
  keyComboSchema,
  parseSettingsFile,
  settingsFileName,
  settingsSchema,
} from "..";
import PaintCanvas from "../../classes/PaintCanvas";
import { createFakeCanvasFactory } from "../../../testing/fakeCanvas";
import { defaultShortcutBindings } from "../../utils/shortcuts";
import { DEFAULT_PALETTE } from "../../palette";
import { PROFILE_PRESETS, linearPoints } from "../../profiles";

const createApp = () =>
  new PaintCanvas({
    width: 10,
    height: 10,
    createCanvas: createFakeCanvasFactory(),
  });

/** A settings file holding some settings */
const file = (settings: object, changes: Record<string, unknown> = {}) => ({
  $schema: appSettingsSchema.$id,
  "@type": APP_SETTINGS_TYPE,
  ...settings,
  ...changes,
});

/** A settings file from before versioned schemas */
const legacyFile = (settings: unknown, format = "paintcanvas-settings") => ({
  format,
  version: 1,
  settings,
});

/** The reason reading a settings file fails */
const failure = (text: string): string | undefined => {
  try {
    parseSettingsFile(text);
  } catch (error) {
    return (error as AssetFileError).reason;
  }
  return undefined;
};

describe("settings schemas", () => {
  it("should compile in ajv strict mode and validate settings and files", () => {
    const ajv = new Ajv2020({
      strict: true,
      schemas: [
        profileGraphSchema,
        colourPaletteSchema,
        brushPresetSchema,
        settingsSchema,
        appSettingsSchema,
      ].map(withoutType),
    });
    expect(appSettingsSchema.$id).toBe(
      "https://lvl99.github.io/paintcanvas/schemas/app-settings-1.0.0.json",
    );
    expect(appSettingsSchema["@type"]).toBe("PaintCanvas/AppSettings");
    const validateSettings = ajv.getSchema(settingsSchema.$id)!;
    const validateFile = ajv.getSchema(appSettingsSchema.$id)!;
    expect(validateFile({ ...file({}), "@type": "Other" })).toBe(false);
    expect(validateFile({ shortcuts: {} })).toBe(false);
    // Wrapper apps' own parts are allowed
    expect(validateFile(file({ livecanvas: { sound: true } }))).toBe(true);
    expect(validateSettings({ palette: ["#ff0000"] })).toBe(true);
    expect(validateFile(file({ brushes: [{ id: "not a UUID" }] }))).toBe(false);
    const settings = collectSettings(createApp());
    expect(validateSettings(settings)).toBe(true);
    expect(validateFile(file(settings))).toBe(true);
    expect(validateSettings({ palette: ["red"] })).toBe(false);
    const id = "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a";
    expect(
      validateSettings({
        profiles: [{ id, name: "Soft", points: linearPoints() }],
      }),
    ).toBe(true);
    // The user's own graphs have UUIDs
    expect(
      validateSettings({
        profiles: [{ id: "a", name: "Soft", points: linearPoints() }],
      }),
    ).toBe(false);
    expect(
      validateSettings({ profiles: [{ id: "a", name: "", points: [] }] }),
    ).toBe(false);
    expect(validateFile(file({ shortcuts: { cut: { key: "" } } }))).toBe(false);
    expect(keyComboSchema.required).toEqual(["key"]);
  });
});

describe("isValidSettings", () => {
  it("should accept full settings, some of them, and none", () => {
    const settings = collectSettings(createApp());
    expect(isValidSettings(settings)).toEqual({ valid: true, value: settings });
    expect(isValidSettings({ palette: [] }).valid).toBe(true);
    expect(isValidSettings({ shortcuts: { deselect: null } }).valid).toBe(true);
    expect(isValidSettings({}).valid).toBe(true);
  });

  it.each([
    ["not an object", "settings", "/ must be object"],
    [
      "an input setting that isn't on or off",
      { input: { focusPen: "yes" } },
      "/input/focusPen must be boolean",
    ],
    [
      "an unknown input setting",
      { input: { tilt: true } },
      "additional properties",
    ],
    [
      "a gesture that isn't a name",
      { input: { gestures: { undo: 2 } } },
      "/input/gestures/undo must be string",
    ],
    [
      "a key combination without a key",
      { shortcuts: { cut: { cmd: true } } },
      "must have required property 'key'",
    ],
    [
      "a key combination with other properties",
      { shortcuts: { cut: { key: "x", fn: true } } },
      "additional properties",
    ],
    [
      "a key combination that isn't an object or null",
      { shortcuts: { cut: "x" } },
      "must be null",
    ],
    ["an unknown theme", { ui: { theme: "auto" } }, "/ui/theme must be equal"],
    [
      "a locale that isn't a tag",
      { ui: { locale: "en US" } },
      "/ui/locale must match",
    ],
    [
      "an unknown rendering",
      { ui: { rendering: "webgl" } },
      "/ui/rendering must be equal",
    ],
    [
      "an unknown UI setting",
      { ui: { fontSize: 20 } },
      "additional properties",
    ],
    [
      "a palette colour that isn't #rrggbb",
      { palette: ["#fff"] },
      "/palette/0 must match",
    ],
    [
      "only one colour",
      { colours: { foreground: "#000000" } },
      "required property 'background'",
    ],
    [
      "a colour that isn't #rrggbb",
      { colours: { foreground: "#000000", background: "white" } },
      "/colours/background must match",
    ],
  ])("should reject settings with %s", (_, input, error) => {
    const result = isValidSettings(input);
    expect(result.valid).toBe(false);
    expect(!result.valid && result.errors.join()).toContain(error);
  });
});

describe("collectSettings and applySettings", () => {
  it("should collect a canvas's input settings, shortcuts, palette, colours, profile graphs, theme, language and rendering", () => {
    const app = createApp();
    expect(collectSettings(app)).toEqual({
      input: app.input.data,
      shortcuts: defaultShortcutBindings(),
      palettes: [],
      colours: { foreground: "#000000", background: "#ffffff" },
      profiles: [],
      brushes: [],
      ui: { theme: "system", rendering: "cpu" },
    });
  });

  it("should accept parts it doesn't know, which wrapper apps check", () => {
    expect(isValidSettings({ theme: "dark" }).valid).toBe(true);
  });

  it("should leave out assets when asked", () => {
    const app = createApp();
    const settings = collectSettings(app, {
      without: ["palettes", "profiles"],
    });
    expect(settings).not.toHaveProperty("profiles");
    expect(settings).not.toHaveProperty("palettes");
    expect(collectSettings(app, { without: ["profiles"] })).toHaveProperty(
      "palettes",
    );
  });

  it("should add profile graphs to the user's own, replacing those with the same IDs", async () => {
    const app = createApp();
    const kept = app.profiles.save({ name: "Kept", points: linearPoints() })!;
    const replaced = app.profiles.save({
      name: "Old",
      points: linearPoints(),
    })!;
    await applySettings(app, { profiles: [{ ...replaced, name: "New" }] });
    expect(app.profiles.graphs.map(({ name }) => name)).toEqual([
      kept.name,
      "New",
    ]);
  });

  it("should give copies that don't change with the canvas", () => {
    const app = createApp();
    const settings = collectSettings(app);
    app.palettes.create("Sunset");
    app.shortcuts.set("deselect", null);
    app.profiles.save({ name: "Soft", points: linearPoints() });
    expect(settings.palettes).toEqual([]);
    expect(settings.profiles).toEqual([]);
    expect(settings.shortcuts?.deselect).toEqual({ key: "d", cmd: true });
  });

  it("should use settings on another canvas", async () => {
    const source = createApp();
    source.input.update({ focusPen: true });
    source.shortcuts.set("tool-brush", { key: "p" });
    source.setColour("#ff0000");
    source.setColour("#00ff00", "background");
    source.ui.update({ theme: "dark", locale: "fr", rendering: "gpu" });
    source.profiles.save({ name: "Soft", points: PROFILE_PRESETS[1]!.points });
    source.palettes.create("Sunset", ["#ff7700"], "Ada");
    const target = createApp();
    await applySettings(target, collectSettings(source));
    expect(collectSettings(target)).toEqual(collectSettings(source));
  });

  it("should leave out parts that aren't given", async () => {
    const app = createApp();
    const before = collectSettings(app);
    await applySettings(app, {});
    expect(collectSettings(app)).toEqual(before);
    await applySettings(app, { palette: [] });
    expect(collectSettings(app)).toEqual(before);
  });

  it("should move colours older versions saved in PaintCanvas's palette to one of the user's, once", async () => {
    const app = createApp();
    await applySettings(app, { palette: ["#123456", "#ABCDEF", "red"] });
    expect(app.palettes.items).toEqual([
      {
        id: expect.any(String),
        name: OLDER_PALETTE_NAME,
        author: { name: "Unknown" },
        colours: ["#123456", "#abcdef"],
      },
    ]);
    await applySettings(app, { palette: ["#123456", "#abcdef"] });
    keepOlderPalette(app, [...DEFAULT_PALETTE]);
    keepOlderPalette(app, ["red"]);
    expect(app.palettes.items).toHaveLength(1);
    expect(app.palette.colours).toEqual(DEFAULT_PALETTE);
  });
});

describe("settingsFileName", () => {
  it("should name the file by date, with a prefix", () => {
    const date = new Date(2026, 10, 4);
    expect(settingsFileName(date)).toBe("paintcanvas-settings-2026-11-04.json");
    expect(settingsFileName(date, "myapp")).toBe(
      "myapp-settings-2026-11-04.json",
    );
    expect(settingsFileName()).toMatch(
      /^paintcanvas-settings-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
});

describe("exportSettingsFile and parseSettingsFile", () => {
  it("should write settings that read back the same, leaving out colours older versions saved in PaintCanvas's palette", () => {
    const app = createApp();
    app.palettes.create("Sunset", ["#ff7700"]);
    const settings = { ...collectSettings(app), livecanvas: { sound: true } };
    const text = exportSettingsFile({ ...settings, palette: ["#123456"] });
    expect(JSON.parse(text)).toEqual(file(settings));
    expect(parseSettingsFile(text)).toEqual(settings);
  });

  it("should read settings files from before versioned schemas, of any format", () => {
    expect(
      parseSettingsFile(
        JSON.stringify(legacyFile({ palette: ["#123456"] }, "myapp-settings")),
      ),
    ).toEqual({ palette: ["#123456"] });
  });

  it.each([
    ["isn't JSON", "{", "read"],
    ["isn't an object", "[]", "invalid"],
    [
      "isn't a settings file",
      JSON.stringify({ $schema: brushPresetSchema.$id }),
      "invalid",
    ],
    ["has nothing to say what it is", "{}", "invalid"],
    [
      "has invalid settings",
      JSON.stringify(file({ palettes: ["red"] })),
      "invalid",
    ],
    [
      "is an older file with invalid settings",
      JSON.stringify(legacyFile({ palette: ["red"] })),
      "invalid",
    ],
    [
      "is a newer version",
      JSON.stringify(
        file(
          {},
          {
            $schema:
              "https://lvl99.github.io/paintcanvas/schemas/app-settings-2.0.0.json",
          },
        ),
      ),
      "unsupported",
    ],
    [
      "is a newer minor version",
      JSON.stringify(
        file(
          {},
          {
            $schema:
              "https://lvl99.github.io/paintcanvas/schemas/app-settings-1.1.0.json",
          },
        ),
      ),
      "unsupported",
    ],
  ])("should throw when the file %s", (_, text, reason) => {
    expect(failure(text)).toBe(reason);
  });
});

describe("settings extensions", () => {
  it("should collect and apply a wrapper app's settings, and keep settings for one not added yet", async () => {
    const app = createApp();
    await applySettings(app, { livecanvas: { sound: true }, other: 1 });
    expect(collectSettings(app)).toMatchObject({
      livecanvas: { sound: true },
      other: 1,
    });
    let sound = false;
    app.settingsExtensions.add({
      key: "livecanvas",
      validate: (value): value is { sound: boolean } =>
        typeof (value as { sound?: unknown })?.sound === "boolean",
      collect: () => ({ sound }),
      apply: (value) => (sound = value.sound),
    });
    expect(sound).toBe(true);
    sound = false;
    expect(collectSettings(app).livecanvas).toEqual({ sound: false });
    await applySettings(app, { livecanvas: { sound: "loud" } });
    expect(sound).toBe(false);
    await applySettings(app, { livecanvas: { sound: true } });
    expect(sound).toBe(true);
  });

  it("should add the brush presets in settings, leaving out invalid ones", async () => {
    const app = createApp();
    const preset = { id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a", name: "Mine" };
    await applySettings(app, {
      brushes: [preset, { id: "round1" } as never],
    });
    expect(app.customPresets.presets).toEqual([preset]);
    expect(collectSettings(app).brushes).toEqual([preset]);
    expect(collectSettings(app, { without: ["brushes"] })).not.toHaveProperty(
      "brushes",
    );
  });
});
