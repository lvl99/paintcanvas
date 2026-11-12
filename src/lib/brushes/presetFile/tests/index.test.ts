import { describe, it, expect } from "vitest";
import { brushPresetFile } from "..";
import { AssetFileError, UNKNOWN_AUTHOR } from "../../../assets";
import { BRUSH_PRESET_TYPE, UNTITLED_PRESET_NAME } from "../../../presets";
import version1Preset from "../../../presets/tests/brushPreset-version1.data.json";
import validPreset from "../../../presets/tests/brushPreset-valid.data.json";
import type { BrushPreset } from "../../types";

/** A version 1 preset: its header and settings side by side */
const flat = {
  id: "2f1d3c5e-7a90-4b5c-8d1a-0b5c4c3e8d1a",
  name: "My brush",
  author: { name: "Ada", handle: "ada.example", homepage: "https://a.test" },
  image: "data:image/png;base64,iVBORw0KGgo=",
  width: 20,
  height: 20,
};

/** The same preset in version 2 */
const preset: BrushPreset = {
  "@type": BRUSH_PRESET_TYPE,
  id: flat.id,
  name: flat.name,
  author: flat.author,
  content: { image: flat.image, width: 20, height: 20 },
};

/** A brush preset file from before versioned schemas */
const legacyFile = (presets: unknown, format = "paintcanvas-brush-presets") =>
  JSON.stringify({ format, version: 1, presets });

/** A brush preset file of version 1 */
const version1File = (items: unknown[]) =>
  JSON.stringify({
    $schema:
      "https://lvl99.github.io/paintcanvas/schemas/brush-preset-collection-1.0.0.json",
    "@type": "PaintCanvas/BrushConfigCollection",
    items,
  });

describe("brushPresetFile", () => {
  it("should name files by date", () => {
    expect(brushPresetFile.fileName(new Date(2026, 9, 4))).toBe(
      "paintcanvas-brush-presets-2026-10-04.json",
    );
    expect(brushPresetFile.fileName(new Date(2026, 9, 4), "myapp")).toBe(
      "myapp-brush-presets-2026-10-04.json",
    );
  });

  it("should write presets to a file that reads back the same", () => {
    const json = brushPresetFile.write([preset]);
    expect(JSON.parse(json)).toEqual({
      $schema:
        "https://lvl99.github.io/paintcanvas/schemas/brush-preset-collection-2.0.0.json",
      "@type": "PaintCanvas/BrushPresetCollection",
      items: [preset],
    });
    expect(brushPresetFile.parse(json)).toEqual([preset]);
  });

  it("should read files of version 1, moving each preset's settings into its content", () => {
    // The version 2 test preset is the version 1 one with a group
    const upgraded: Record<string, unknown> = { ...validPreset };
    delete upgraded.group;
    expect(
      brushPresetFile.parse(version1File([version1Preset]), { author: "Bo" }),
    ).toEqual([upgraded]);
    expect(
      brushPresetFile.parse(version1File([{ id: flat.id, width: 5 }]), {
        author: "Bo",
      }),
    ).toEqual([
      {
        "@type": BRUSH_PRESET_TYPE,
        id: flat.id,
        name: UNTITLED_PRESET_NAME,
        author: "Bo",
        content: { width: 5 },
      },
    ]);
  });

  it("should read files from before versioned schemas, of any format, renaming the author's website", () => {
    const { homepage, ...author } = flat.author;
    const old = { ...flat, author: { ...author, website: homepage } };
    expect(brushPresetFile.parse(legacyFile([old]))).toEqual([preset]);
    expect(
      brushPresetFile.parse(legacyFile([{ ...flat, author: "Ada" }], "myapp")),
    ).toEqual([{ ...preset, author: "Ada" }]);
    expect(brushPresetFile.parse(legacyFile([{ id: flat.id }]))).toEqual([
      {
        "@type": BRUSH_PRESET_TYPE,
        id: flat.id,
        name: UNTITLED_PRESET_NAME,
        author: UNKNOWN_AUTHOR,
        content: {},
      },
    ]);
  });

  it.each([
    ["isn't JSON", "{", "read"],
    ["isn't a preset file", '{"presets": []}', "invalid"],
    [
      "has a built-in preset (their IDs aren't UUIDs)",
      legacyFile([{ id: "round1" }]),
      "invalid",
    ],
    ["has presets that aren't a list", legacyFile({}), "invalid"],
    [
      "has items of version 1 that aren't a list",
      JSON.stringify({ ...JSON.parse(version1File([])), items: {} }),
      "invalid",
    ],
    [
      "is of an unknown version",
      JSON.stringify({ format: "x", version: 2 }),
      "invalid",
    ],
    [
      "is of a newer version",
      JSON.stringify({
        $schema:
          "https://lvl99.github.io/paintcanvas/schemas/brush-preset-collection-3.0.0.json",
        "@type": "PaintCanvas/BrushPresetCollection",
        items: [],
      }),
      "unsupported",
    ],
  ])("should reject a file that %s", (_label, text, reason) => {
    expect(() => brushPresetFile.parse(text)).toThrow(
      new AssetFileError(reason as "read"),
    );
    try {
      brushPresetFile.parse(text);
    } catch (error) {
      expect((error as AssetFileError).reason).toBe(reason);
    }
  });

  it("should refuse to export nothing, or presets that aren't valid", () => {
    expect(() => brushPresetFile.write([])).toThrow(
      new AssetFileError("empty"),
    );
    expect(() => brushPresetFile.write([{ ...preset, id: "round1" }])).toThrow(
      new AssetFileError("invalid"),
    );
  });
});
