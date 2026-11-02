import { describe, it, expect } from "vitest";
import {
  PRESET_FILE_ERRORS,
  PresetFileError,
  exportPresetFile,
  parsePresetFile,
  presetFileName,
} from "..";

const preset = {
  id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
  name: "My brush",
  author: { name: "Ada", handle: "ada.example" },
  image: "data:image/png;base64,iVBORw0KGgo=",
  width: 20,
  height: 20,
};

describe("presetFileName", () => {
  it("should name files by date", () => {
    expect(presetFileName(new Date(2026, 9, 4))).toBe(
      "paintcanvas-brush-presets-2026-10-04.json",
    );
    expect(presetFileName()).toMatch(
      /^paintcanvas-brush-presets-\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(presetFileName(new Date(2026, 9, 4), "myapp")).toBe(
      "myapp-brush-presets-2026-10-04.json",
    );
  });
});

describe("exportPresetFile and parsePresetFile", () => {
  it("should write presets to a file that reads back the same", () => {
    const json = exportPresetFile([preset]);
    expect(JSON.parse(json)).toEqual({
      format: "paintcanvas-brush-presets",
      version: 1,
      presets: [preset],
    });
    expect(parsePresetFile(json)).toEqual([preset]);
  });

  it("should read files of other formats only when given", () => {
    const mine = exportPresetFile([preset], "myapp-presets");
    expect(JSON.parse(mine).format).toBe("myapp-presets");
    expect(() => parsePresetFile(mine)).toThrow(
      new PresetFileError(PRESET_FILE_ERRORS.incompatible),
    );
    expect(parsePresetFile(mine, ["myapp-presets"])).toEqual([preset]);
  });

  it("should refuse to export nothing, or presets that aren't valid", () => {
    expect(() => exportPresetFile([])).toThrow(
      new PresetFileError(PRESET_FILE_ERRORS.empty),
    );
    expect(() => exportPresetFile([{ ...preset, id: "round1" }])).toThrow(
      new PresetFileError(PRESET_FILE_ERRORS.export),
    );
  });

  it.each([
    ["isn't JSON", "{"],
    ["isn't a preset file", '{"presets": []}'],
    [
      "has a built-in preset (their IDs aren't UUIDs)",
      JSON.stringify({
        format: "paintcanvas-brush-presets",
        version: 1,
        presets: [{ id: "round1" }],
      }),
    ],
  ])("should reject a file that %s", (_label, text) => {
    expect(() => parsePresetFile(text)).toThrow(
      new PresetFileError(PRESET_FILE_ERRORS.incompatible),
    );
  });
});
