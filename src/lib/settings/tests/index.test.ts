import { describe, it, expect } from "vitest";
import { Ajv } from "ajv";
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
    const ajv = new Ajv({
      strict: true,
      schemas: [keyComboSchema, settingsSchema],
    });
    const validateSettings = ajv.getSchema(settingsSchema.$id)!;
    const validateFile = ajv.compile(settingsFileSchema);
    const settings = collectSettings(createApp());
    expect(validateSettings(settings)).toBe(true);
    expect(validateFile(file(settings))).toBe(true);
    expect(validateSettings({ palette: ["red"] })).toBe(false);
    expect(validateFile(file({ shortcuts: { cut: { key: "" } } }))).toBe(false);
  });
});

describe("isValidSettings", () => {
  it("should accept full settings, some of them, and none", () => {
    const settings = collectSettings(createApp());
    expect(isValidSettings(settings)).toEqual({ valid: true, value: settings });
    expect(isValidSettings({ palette: [] }).valid).toBe(true);
    expect(isValidSettings({ shortcuts: { cut: null } }).valid).toBe(true);
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
  it("should collect a canvas's input settings, shortcuts, palette and colours", () => {
    const app = createApp();
    expect(collectSettings(app)).toEqual({
      input: app.input.data,
      shortcuts: defaultShortcutBindings(),
      palette: DEFAULT_PALETTE,
      colours: { foreground: "#000000", background: "#ffffff" },
    });
  });

  it("should give copies that don't change with the canvas", () => {
    const app = createApp();
    const settings = collectSettings(app);
    app.palette.add("#123456");
    app.shortcuts.set("cut", null);
    expect(settings.palette).toEqual(DEFAULT_PALETTE);
    expect(settings.shortcuts?.cut).toEqual({ key: "x", cmd: true });
  });

  it("should use settings on another canvas", () => {
    const source = createApp();
    source.input.update({ focusPen: true });
    source.shortcuts.set("tool-brush", { key: "p" });
    source.palette.set(["#123456"]);
    source.setColour("#ff0000");
    source.setColour("#00ff00", "background");
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
