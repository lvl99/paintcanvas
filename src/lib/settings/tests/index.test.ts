import { describe, it, expect } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { withoutType } from "../../validation/standalone";
import { profileGraphSchema } from "../../profiles/schema";
import {
  SETTINGS_FILE_ERRORS,
  SETTINGS_FILE_FORMAT,
  SETTINGS_FILE_VERSION,
  SettingsFileError,
  applySettings,
  collectSettings,
  exportSettingsFile,
  isValidSettings,
  keyComboSchema,
  parseSettingsFile,
  settingsFileName,
  settingsFileSchema,
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
const file = (settings: unknown, changes: Record<string, unknown> = {}) => ({
  format: SETTINGS_FILE_FORMAT,
  version: SETTINGS_FILE_VERSION,
  settings,
  ...changes,
});

describe("settings schemas", () => {
  it("should compile in ajv strict mode and validate settings and files", () => {
    const ajv = new Ajv2020({
      strict: true,
      schemas: [profileGraphSchema, keyComboSchema, settingsSchema].map(
        withoutType,
      ),
    });
    const validateSettings = ajv.getSchema(settingsSchema.$id)!;
    const validateFile = ajv.compile(settingsFileSchema);
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
    ["unknown parts", { theme: "dark" }, "additional properties"],
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
      palette: DEFAULT_PALETTE,
      colours: { foreground: "#000000", background: "#ffffff" },
      profiles: [],
      ui: { theme: "system", rendering: "cpu" },
    });
  });

  it("should give copies that don't change with the canvas", () => {
    const app = createApp();
    const settings = collectSettings(app);
    app.palette.add("#123456");
    app.shortcuts.set("deselect", null);
    app.profiles.save({ name: "Soft", points: linearPoints() });
    expect(settings.palette).toEqual(DEFAULT_PALETTE);
    expect(settings.profiles).toEqual([]);
    expect(settings.shortcuts?.deselect).toEqual({ key: "d", cmd: true });
  });

  it("should use settings on another canvas", () => {
    const source = createApp();
    source.input.update({ focusPen: true });
    source.shortcuts.set("tool-brush", { key: "p" });
    source.palette.set(["#123456"]);
    source.setColour("#ff0000");
    source.setColour("#00ff00", "background");
    source.ui.update({ theme: "dark", locale: "fr", rendering: "gpu" });
    source.profiles.save({ name: "Soft", points: PROFILE_PRESETS[1]!.points });
    const target = createApp();
    applySettings(target, collectSettings(source));
    expect(collectSettings(target)).toEqual(collectSettings(source));
  });

  it("should leave out parts that aren't given", () => {
    const app = createApp();
    const before = collectSettings(app);
    applySettings(app, {});
    expect(collectSettings(app)).toEqual(before);
    applySettings(app, { palette: [] });
    expect(collectSettings(app)).toEqual({ ...before, palette: [] });
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
  it("should write settings that read back the same", () => {
    const settings = collectSettings(createApp());
    const text = exportSettingsFile(settings);
    expect(JSON.parse(text)).toEqual(file(settings));
    expect(parseSettingsFile(text)).toEqual(settings);
  });

  it("should write and read the implementer's own format", () => {
    const text = exportSettingsFile({ palette: [] }, "myapp-settings");
    expect(JSON.parse(text).format).toBe("myapp-settings");
    expect(parseSettingsFile(text, ["myapp-settings"])).toEqual({
      palette: [],
    });
  });

  it.each([
    ["isn't JSON", "{"],
    ["has invalid settings", JSON.stringify(file({ palette: ["red"] }))],
    ["has another version", JSON.stringify(file({}, { version: 2 }))],
    ["has another format", JSON.stringify(file({}, { format: "other" }))],
  ])("should throw when the file %s", (_, text) => {
    expect(() => parseSettingsFile(text)).toThrow(SettingsFileError);
    expect(() => parseSettingsFile(text)).toThrow(
      SETTINGS_FILE_ERRORS.incompatible,
    );
  });
});
